// Fleet Orchestrator — multi-CC coordination with auto-discovery
// Detects ALL CC instances globally by scanning ~/.claude/sessions/
const path = require('path'), fs = require('fs'), os = require('os')
const ROOT = path.dirname(__filename)
const FLEET_FILE = path.join(ROOT, '.fleet_state.json')
const LOCK_DIR = path.join(ROOT, '.fleet_locks')
const CC_SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions')
const CC_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')

function init() {
  if (!fs.existsSync(LOCK_DIR)) fs.mkdirSync(LOCK_DIR, { recursive: true })
}

function readState() {
  try { return JSON.parse(fs.readFileSync(FLEET_FILE, 'utf-8')) }
  catch(e) { return { instances: [], locks: [], tasks: [] } }
}

function writeState(state) {
  fs.writeFileSync(FLEET_FILE, JSON.stringify(state, null, 2), 'utf-8')
}

// Auto-detect this CC instance ID from session files (match by PID)
function detectInstanceId() {
  const ourPid = process.pid
  try {
    const files = fs.readdirSync(CC_SESSIONS_DIR).filter(f => f.endsWith('.json'))
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CC_SESSIONS_DIR, f), 'utf-8'))
        if (data.pid === ourPid && data.sessionId) {
          return data.sessionId
        }
      } catch(e) {}
    }
  } catch(e) {}
  // Fallback: derive from cwd + pid
  return `${path.basename(process.cwd())}_${ourPid}`
}

// Discover ALL CC sessions — including those without Overmind
function discoverSessions() {
  const sessions = []
  try {
    const files = fs.readdirSync(CC_SESSIONS_DIR).filter(f => f.endsWith('.json'))
    for (const f of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(CC_SESSIONS_DIR, f), 'utf-8'))
        sessions.push({
          id: raw.sessionId || f.replace('.json', ''),
          pid: raw.pid,
          cwd: raw.cwd || 'unknown',
          status: raw.status === 'busy' ? 'active' : 'idle',
          started_at: raw.startedAt ? new Date(raw.startedAt).toISOString() : null,
          updated_at: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : null,
          version: raw.version || 'unknown',
          kind: raw.kind || 'interactive',
          has_overmind: false // will be set to true for registered instances
        })
      } catch(e) {}
    }
  } catch(e) {}

  // Try to detect what each session is working on from its transcript
  for (const s of sessions) {
    try {
      // Dynamic: find the project dir containing this session's transcript
      let projDir = null;
      try {
        const dirs = fs.readdirSync(CC_PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const d of dirs) {
          const candidate = path.join(CC_PROJECTS_DIR, d.name, s.id + '.jsonl');
          if (fs.existsSync(candidate)) { projDir = path.join(CC_PROJECTS_DIR, d.name); break; }
        }
      } catch(e) {}
      if (!projDir) continue;
      const jsonlFile = path.join(projDir, s.id + '.jsonl')
      if (fs.existsSync(jsonlFile)) {
        const stat = fs.statSync(jsonlFile)
        s.last_transcript_mtime = stat.mtime.toISOString()
        s.recently_active = (Date.now() - stat.mtimeMs) < 300000
        // Only parse transcript for active sessions (file < 5 min old)
        if (!s.recently_active) continue
        const content = fs.readFileSync(jsonlFile, 'utf-8')
        const lines = content.trim().split('\n')
        // Scan last 200 lines for ai-title or user text messages (skip tool results)
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 200); i--) {
          try {
            const entry = JSON.parse(lines[i])
            // ai-title gives clean topic
            if (entry.aiTitle) { s.current_topic = entry.aiTitle; break }
            // Parse user messages — extract text content, skip tool results
            if (entry.type === 'user' && entry.message && typeof entry.message === 'object') {
              const content = entry.message.content
              if (typeof content === 'string' && content.trim()) { s.current_topic = content.substring(0, 100); break }
              if (Array.isArray(content)) {
                for (const part of content) {
                  if (part && typeof part === 'string' && part.trim()) { s.current_topic = part.substring(0, 100); break }
                  if (part && part.text && part.text.trim()) { s.current_topic = part.text.substring(0, 100); break }
                }
                if (s.current_topic) break
              }
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
  }

  return sessions
}

// Instance registration
function register(instanceId, cwd = process.cwd()) {
  init()
  const state = readState()
  const existing = state.instances.findIndex(i => i.id === instanceId)
  const instance = {
    id: instanceId,
    pid: process.pid,
    cwd,
    status: 'active',
    registered_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    current_task: null,
    current_topic: null
  }
  if (existing >= 0) state.instances[existing] = instance
  else state.instances.push(instance)
  // Clean dead instances (>1h no heartbeat)
  state.instances = state.instances.filter(i => {
    const age = Date.now() - new Date(i.last_heartbeat).getTime()
    return age < 3600000
  })
  writeState(state)
  return { id: instanceId, fleet_size: state.instances.length, others: state.instances.filter(i => i.id !== instanceId).length }
}

// Heartbeat
function heartbeat(instanceId) {
  const state = readState()
  const inst = state.instances.find(i => i.id === instanceId)
  if (inst) {
    inst.last_heartbeat = new Date().toISOString()
    inst.status = 'active'
    inst.pid = process.pid
  }
  writeState(state)
}

// Task lock — acquire exclusive work on a topic
function lock(instanceId, topic) {
  init()
  const lockFile = path.join(LOCK_DIR, `${sanitizeTopic(topic)}.lock`)
  try {
    const fd = fs.openSync(lockFile, 'wx')
    fs.writeSync(fd, JSON.stringify({ instance: instanceId, topic, acquired: new Date().toISOString() }))
    fs.closeSync(fd)
    const state = readState()
    const inst = state.instances.find(i => i.id === instanceId)
    if (inst) { inst.current_topic = topic; inst.current_task = topic }
    state.locks.push({ topic, instance: instanceId, acquired: new Date().toISOString() })
    writeState(state)
    return { acquired: true, topic }
  } catch(e) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf-8'))
      const age = Date.now() - new Date(existing.acquired).getTime()
      if (age > 7200000) {
        fs.unlinkSync(lockFile)
        return lock(instanceId, topic)
      }
      return { acquired: false, reason: `locked by ${existing.instance} (${Math.round(age/60000)}min ago)` }
    } catch(e2) { return { acquired: false, reason: 'lock error' } }
  }
}

function unlock(instanceId, topic) {
  const lockFile = path.join(LOCK_DIR, `${sanitizeTopic(topic)}.lock`)
  try { fs.unlinkSync(lockFile) } catch(e) {}
  const state = readState()
  state.locks = state.locks.filter(l => !(l.topic === topic && l.instance === instanceId))
  const inst = state.instances.find(i => i.id === instanceId)
  if (inst && inst.current_topic === topic) inst.current_topic = null
  writeState(state)
}

// Full fleet status — reads from daemon's fleet_broadcast.md (no transcript IO)
function fleetStatus(instanceId) {
  const state = readState()
  const overmindInstances = state.instances

  // Fast path: parse daemon's already-generated broadcast file
  const discovered = _parseBroadcastFile()

  // Merge: mark discovered sessions that have Overmind
  const allInstances = discovered.map(d => {
    const match = overmindInstances.find(o => o.id === d.id)
    if (match) {
      d.has_overmind = true
      d.current_task = match.current_task || d.current_topic
      d.last_heartbeat = match.last_heartbeat
    }
    return d
  })

  // Add Overmind instances not in discovered (unlikely but handle)
  for (const oi of overmindInstances) {
    if (!allInstances.find(a => a.id === oi.id)) {
      allInstances.push({
        id: oi.id,
        pid: oi.pid,
        cwd: oi.cwd,
        status: oi.status,
        has_overmind: true,
        current_task: oi.current_task,
        last_heartbeat: oi.last_heartbeat
      })
    }
  }

  const others = allInstances.filter(i => i.id !== instanceId)
  const activeLocks = state.locks.filter(l => {
    const age = Date.now() - new Date(l.acquired).getTime()
    return age < 7200000
  })

  return {
    fleet_size: allInstances.length,
    with_overmind: allInstances.filter(i => i.has_overmind).length,
    without_overmind: allInstances.filter(i => !i.has_overmind).length,
    active_others: others.filter(i => i.status === 'active').length,
    self: allInstances.find(i => i.id === instanceId),
    others: others.map(i => ({
      id: i.id?.substring(0, 8),
      pid: i.pid,
      status: i.status,
      working_on: i.current_task || i.current_topic || '(idle)',
      has_overmind: i.has_overmind,
      last_seen: i.last_heartbeat
        ? Math.round((Date.now() - new Date(i.last_heartbeat).getTime()) / 60000) + 'min ago'
        : (i.recently_active ? 'active (no overmind)' : 'unknown')
    })),
    locks: activeLocks.map(l => ({ topic: l.topic, by: l.instance?.substring(0, 8) })),
    suggestion: suggestWork(state, instanceId, discovered)
  }
}

function suggestWork(state, instanceId, discovered) {
  const self = state.instances.find(i => i.id === instanceId)
  const locked = new Set(state.locks.map(l => l.topic))
  const othersTopics = state.instances.filter(i => i.id !== instanceId).map(i => i.current_topic).filter(Boolean)

  // Check for conflicting work
  if (self && self.current_topic && othersTopics.includes(self.current_topic)) {
    return `⚠️ 冲突: 其他实例也在处理 "${self.current_topic}"`
  }

  if (!self || !self.current_topic) {
    try {
      const index = require(path.join(ROOT, 'index'))
      index.init()
      const issues = index.getAllMemoryKeys().filter(m =>
        (m.key || '').startsWith('issue_') || (m.key || '').includes('blocker')
      ).slice(0, 5)
      for (const issue of issues) {
        if (!locked.has(issue.key) && !othersTopics.includes(issue.key)) {
          return `建议处理: ${issue.key} (未被其他实例锁定)`
        }
      }
    } catch(e) {}
  }

  // Show what others are doing
  const otherNames = othersTopics.length > 0 ? othersTopics.join(', ') : null
  if (otherNames) return `其他实例在处理: ${otherNames}。当前无冲突。`
  return '无其他活跃实例，自由工作。'
}

// Parse daemon's .fleet_broadcast.md — zero transcript IO
let _broadcastCache = { ts: 0, sessions: [] }
function _parseBroadcastFile() {
  const now = Date.now()
  // Cache for 3s (daemon refreshes every 5s)
  if (now - _broadcastCache.ts < 3000 && _broadcastCache.sessions.length > 0) return _broadcastCache.sessions
  try {
    const text = fs.readFileSync(path.join(ROOT, '.fleet_broadcast.md'), 'utf-8')
    const sessions = []
    const lines = text.split('\n')
    let current = null
    for (const line of lines) {
      // Match session header: ### 07d8ddd5 [🧠] 🟢 topic
      const headerMatch = line.match(/^###\s+(\S+)\s+\[(.+?)\]\s+(🟢|⚪)\s+(.+)/)
      if (headerMatch) {
        if (current) sessions.push(current)
        current = {
          id: headerMatch[1],
          has_overmind: headerMatch[2] === '🧠',
          status: headerMatch[3] === '🟢' ? 'active' : 'idle',
          topic: headerMatch[4].trim(),
          recently_active: headerMatch[3] === '🟢'
        }
      }
      // Match Q/A lines
      if (current && line.startsWith('> ❓')) {
        if (!current.qa_pairs) current.qa_pairs = []
        current.qa_pairs.push({ q: line.replace('> ❓', '').trim().substring(0, 200) })
      }
    }
    if (current) sessions.push(current)
    _broadcastCache = { ts: now, sessions }
    return sessions
  } catch(e) { return [] }
}

// Hybrid fleetStatus using broadcast file + fleet state

function sanitizeTopic(topic) {
  return (topic || 'unknown').replace(/[^a-z0-9_-]/gi, '_').substring(0, 50)
}

process.on('exit', () => {
  const state = readState()
  const selfId = detectInstanceId()
  state.instances = state.instances.filter(i => i.id !== selfId)
  state.locks = state.locks.filter(l => l.instance !== selfId)
  try { writeState(state) } catch(e) {}
})

module.exports = { register, heartbeat, lock, unlock, fleetStatus, detectInstanceId, discoverSessions }
