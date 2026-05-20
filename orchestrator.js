// Fleet Orchestrator — multi-CC coordination
// Task locks, work distribution, shared memory coordination
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)
const FLEET_FILE = path.join(ROOT, '.fleet_state.json')
const LOCK_DIR = path.join(ROOT, '.fleet_locks')

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

// Instance registration
function register(instanceId, cwd = process.cwd()) {
  init()
  const state = readState()
  const existing = state.instances.findIndex(i => i.id === instanceId)
  const instance = {
    id: instanceId,
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
  if (inst) inst.last_heartbeat = new Date().toISOString()
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
    // Update fleet state
    const state = readState()
    const inst = state.instances.find(i => i.id === instanceId)
    if (inst) { inst.current_topic = topic; inst.current_task = topic }
    state.locks.push({ topic, instance: instanceId, acquired: new Date().toISOString() })
    writeState(state)
    return { acquired: true, topic }
  } catch(e) {
    // Lock exists — check if it's stale
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf-8'))
      const age = Date.now() - new Date(existing.acquired).getTime()
      if (age > 7200000) { // 2h stale → release
        fs.unlinkSync(lockFile)
        return lock(instanceId, topic) // retry
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

// Check what others are working on — avoid collision
function fleetStatus(instanceId) {
  const state = readState()
  const others = state.instances.filter(i => i.id !== instanceId)
  const activeLocks = state.locks.filter(l => {
    const age = Date.now() - new Date(l.acquired).getTime()
    return age < 7200000
  })
  return {
    fleet_size: state.instances.length,
    active_others: others.filter(i => i.status === 'active').length,
    others: others.map(i => ({
      id: i.id,
      working_on: i.current_topic || '(idle)',
      last_seen: Math.round((Date.now() - new Date(i.last_heartbeat).getTime()) / 60000) + 'min ago'
    })),
    locks: activeLocks.map(l => ({ topic: l.topic, by: l.instance })),
    suggestion: suggestWork(state, instanceId)
  }
}

function suggestWork(state, instanceId) {
  const self = state.instances.find(i => i.id === instanceId)
  const locked = new Set(state.locks.map(l => l.topic))
  const othersTopics = state.instances.filter(i => i.id !== instanceId).map(i => i.current_topic).filter(Boolean)

  if (!self || !self.current_topic) {
    // Find open topics from memory that aren't locked
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

  if (othersTopics.length > 0) {
    return `其他实例在处理: ${othersTopics.join(', ')}。当前无冲突建议。`
  }
  return '无其他活跃实例，自由工作。'
}

function sanitizeTopic(topic) {
  return (topic || 'unknown').replace(/[^a-z0-9_-]/gi, '_').substring(0, 50)
}

// Cleanup on exit
process.on('exit', () => {
  const state = readState()
  const selfId = process.env.OVERMIND_INSTANCE_ID || 'unknown'
  state.instances = state.instances.filter(i => i.id !== selfId)
  state.locks = state.locks.filter(l => l.instance !== selfId)
  try { writeState(state) } catch(e) {}
})

module.exports = { register, heartbeat, lock, unlock, fleetStatus }
