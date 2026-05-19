const path = require('path')
const fs = require('fs')
const https = require('https')

const ROOT = path.dirname(__filename)
const INJECTION_FILE = path.join(ROOT, 'injection.md')
const LOCK_FILE = path.join(ROOT, '.injection.lock')

function writeInjection(content) {
  const tmpFile = INJECTION_FILE + '.tmp'
  for (let retry = 0; retry < 10; retry++) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx')
      fs.writeFileSync(tmpFile, content, 'utf-8')
      fs.renameSync(tmpFile, INJECTION_FILE)
      fs.closeSync(fd)
      fs.unlinkSync(LOCK_FILE)
      return
    } catch(e) {
      if (e.code === 'EEXIST') {
        const t = fs.statSync(LOCK_FILE).mtimeMs
        if (Date.now() - t > 5000) { fs.unlinkSync(LOCK_FILE) }
        require('child_process').execSync('sleep 0.05')
      } else { throw e }
    }
  }
}
const EPISODIC_DIR = path.join(ROOT, 'memory', 'episodic')
const TRANSCRIPT_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', 'D--claude')
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || 'YOUR_DEEPSEEK_API_KEY'

if (!fs.existsSync(EPISODIC_DIR)) fs.mkdirSync(EPISODIC_DIR, { recursive: true })

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-pro[1m]',
      max_tokens: 16384,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/anthropic/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const body = JSON.parse(data)
          if (body.error) { reject(new Error(body.error.message || 'API error')); return }
          const textBlock = body.content?.find(c => c.type === 'text')
          resolve(textBlock ? textBlock.text : (body.content?.[0]?.text || ''))
        }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// Fast/cheap API for memory selection — flash model, no thinking
function callDeepSeekFlash(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }]
    })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      timeout: 120000
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data).choices[0].message.content) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// AI-driven skill selection — keyword pre-filter → AI picks best
async function selectSkillsAI(userTask, projCtx, allSkills) {
  try {
    if (!allSkills || allSkills.length === 0) return null

    const index_ = require(path.join(ROOT, 'index'))

    // Stage 1: Keyword pre-filter — same as selectMemoriesAI pattern
    const query = userTask || projCtx || ''
    const keywordScored = index_.searchSkills(query, 20)
    const candidates = keywordScored.length >= 3 ? keywordScored : allSkills.slice(0, 20)

    // Stage 2: Full content for top candidates, AI picks
    const parts = []
    for (const s of candidates) {
      try {
        let content = fs.readFileSync(s.file_path, 'utf-8')
        const m = content.match(/^---[\s\S]*?---\n([\s\S]+)/)
        if (m) content = m[1].trim()
        parts.push(`### ${s.name}\n${content.substring(0, 600)}`)
      } catch(e) {
        parts.push(`### ${s.name}\n${(s.description || '').substring(0, 200)}`)
      }
    }

    const skillPrefsText = index_.formatSkillPrefsForAI()
    const catalogText = parts.join('\n\n')
    const prompt = `${skillPrefsText ? skillPrefsText + '\n\n' : ''}Pick 0-5 skills from the catalog that best match this task.

- Return 0 skills ONLY for very short daily greetings. For ANY technical task, code change, debugging, project planning, or tool usage, you MUST pick at least 1 matching skill.
- Return ONLY a JSON array: ["skill-a","skill-b"] or []

Task: ${(userTask || '').substring(0, 300)}

${catalogText}`

    const logFile_ = path.join(ROOT, 'inject.log')
    fs.appendFileSync(logFile_, `${new Date().toISOString()} selectSkillsAI: calling flash API (${catalogText.length} chars, ${candidates.length} skills)\n`)
    const result = await callDeepSeekFlash(prompt)
    if (!result) {
      fs.appendFileSync(logFile_, `${new Date().toISOString()} selectSkillsAI: API returned empty\n`)
      return null
    }

    let names = []
    try { names = JSON.parse(result.trim()) } catch(e) {
      const m = result.match(/\[.*\]/s)
      if (m) try { names = JSON.parse(m[0]) } catch(e2) {}
    }
    if (!Array.isArray(names)) return null

    const skills = []
    for (const name of names) {
      const s = allSkills.find(r => r.name === name)
      if (s) skills.push(s)
    }
    fs.appendFileSync(logFile_, `${new Date().toISOString()} selectSkillsAI: picked [${skills.map(s=>s.name).join(',')}]\n`)
    return skills.slice(0, 5)
  } catch(e) {
    const logFile_ = path.join(ROOT, 'inject.log')
    fs.appendFileSync(logFile_, `${new Date().toISOString()} selectSkillsAI ERROR: ${e.message}\n`)
    return null
  }
}

// AI-driven memory selection — pre-filter top candidates, then AI picks best
async function selectMemoriesAI(userTask, allMems, limit = 5) {
  try {
    if (!allMems || allMems.length === 0) return null
    // Pre-filter: sliding window keywords for mixed CJK+English without spaces
    const raw = (userTask || '').toLowerCase()
    const keywords = []
    for (let i = 0; i < raw.length - 1; i++) {
      const ch = raw.substring(i, i + 2)
      if (/[a-z0-9一-鿿]{2}/.test(ch)) keywords.push(ch)
    }
    // Also add longer English-only words
    const engWords = raw.match(/[a-z0-9]{3,}/g) || []
    for (const w of engWords) keywords.push(w)
    const hasCJK = /[一-鿿]/.test(userTask || '')
    const scored = allMems.map(m => {
      const keyLow = (m.key || '').toLowerCase()
      const contentLow = (m.content || '').toLowerCase()
      const txt = keyLow + ' ' + contentLow
      let s = 0
      for (const k of keywords) {
        if (keyLow.includes(k)) s += 2 // key match is strong signal
        else if (contentLow.includes(k)) s += 1
      }
      // CJK queries: boost content-only matches (Chinese→English cross-lingual)
      if (hasCJK && contentLow.length > 20) s += 0.5
      // Feedback boost: proven-effective memories get higher score
      const eff = (m.effectiveness_score || 0.5)
      const inj = (m.injected_count || 0)
      const effBoost = eff * 1.5 + (inj > 0 ? 0.1 : 0)
      return Object.assign({}, m, {kscore: s + effBoost})
    })
    scored.sort((a, b) => b.kscore - a.kscore)
    const shortlist = scored.slice(0, 40)
    if (shortlist.length === 0) return null

    const catalog = shortlist.map(m => `- ${m.key}: ${(m.content || '').substring(0, 60)}`).join('\n')
    const prompt = `Pick the ${limit} BEST memories for this task. Prefer specific technical facts. Skip plugin-internal noise. You MUST pick at least 2. Return ONLY JSON array: ["key1","key2","key3"]

Task: ${(userTask || '').substring(0, 300)}

${catalog}`

    const result = await callDeepSeekFlash(prompt)
    if (!result) return null

    let names = []
    try { names = JSON.parse(result.trim()) } catch(e) {
      const m = result.match(/\[.*\]/s)
      if (m) try { names = JSON.parse(m[0]) } catch(e2) {}
    }
    if (!Array.isArray(names)) return null

    return names.map(n => allMems.find(m => m.key === n)).filter(Boolean).slice(0, limit)
  } catch(e) { return null }
}

// Task decomposition — vague command + memories/issues → concrete plan
async function decomposeTask(userTask, allMemKeys, issueMems) {
  try {
    // Only decompose vague/short tasks
    const t = (userTask || '').trim()
    if (t.length > 50) return null // detailed enough already
    if (!t || /^(重启|继续|好了|嗯|行|好|是的|对|test|hi|hello)/i.test(t)) {
      // Very short — might be continuation of previous work
    } else if (t.length > 10 && !/[,，、\s]/.test(t)) {
      // Single topic without structure — might benefit from decomposition
    } else if (/\d/.test(t) && t.length < 15) {
      // "1,2,3都修" style — needs decomposition
    } else {
      return null // not vague enough
    }

    // Gather context: unresolved issues + top procedurals + top memories
    const issues = (issueMems || []).slice(0, 3)
    const contextParts = []
    if (issues.length > 0) {
      contextParts.push('## Open Issues\n' + issues.map(m => `- ${m.key}: ${(m.content||'').substring(0, 120)}`).join('\n'))
    }
    const topMems = (allMemKeys || []).filter(m => (m.confidence || 0.5) > 0.4).slice(0, 5)
    if (topMems.length > 0) {
      contextParts.push('## Recent Knowledge\n' + topMems.map(m => `- ${m.key}: ${(m.content||'').substring(0, 100)}`).join('\n'))
    }
    if (contextParts.length === 0) return null

    const ctx = contextParts.join('\n\n')
    const prompt = `The user said: "${t}"

Based on the context below, what should the AI assistant do? Output a 2-4 step concrete plan. Each step one line, no numbering. Be specific about WHAT to do, not how.

${ctx}

Plan:`

    const result = await callDeepSeekFlash(prompt)
    if (!result || result.length < 10) return null
    return result.trim().split('\n').filter(l => l.length > 10).slice(0, 5).join('\n')
  } catch(e) { return null }
}

function getUserTask() {
  try {
    const files = fs.readdirSync(TRANSCRIPT_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(TRANSCRIPT_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)
    if (!files.length) return null

    const latest = path.join(TRANSCRIPT_DIR, files[0].name)
    const raw = fs.readFileSync(latest, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)

    // Collect last 3 user messages from tail, return longest (usually the task)
    const userMsgs = []
    for (let i = lines.length - 1; i >= 0 && userMsgs.length < 3; i--) {
      try {
        const entry = JSON.parse(lines[i])
        if (entry.type !== 'user') continue
        const msg = entry.message
        if (!msg) continue
        let text = null
        if (typeof msg === 'string') text = msg
        else if (typeof msg.content === 'string') text = msg.content
        else if (Array.isArray(msg.content)) {
          const tb = msg.content.find(b => b.type === 'text')
          if (tb) text = tb.text
        }
        // Skip compaction summaries and continuation markers
        if (text && text.includes('This session is being continued')) continue
        if (text && text.includes('Primary Request and Intent:')) continue
        if (text && /^Continue from where you left off/.test(text)) continue
        if (text) userMsgs.push(text.substring(0, 300))
      } catch(e) {}
    }
    // Return longest message (likely the task), or the last one
    userMsgs.sort((a, b) => b.length - a.length)
    return userMsgs[0] || null
  } catch(e) { return null }
}

function loadPreviousTranscript() {
  try {
    const files = fs.readdirSync(TRANSCRIPT_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(TRANSCRIPT_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)

    if (files.length < 2) return null
    const prevFile = path.join(TRANSCRIPT_DIR, files[1].name)
    const raw = fs.readFileSync(prevFile, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    const tail = lines.slice(-300)
    return {
      path: prevFile,
      messages: tail.map(l => {
        try { const j = JSON.parse(l); return { role: j.message?.role || 'unknown', content: (j.message?.content || '').substring(0, 800) } }
        catch(e) { return { role: 'unknown', content: l.substring(0, 200) } }
      }).filter(m => m.content),
      raw: tail.join('\n')
    }
  } catch(e) { return null }
}

async function extractRichFromTranscript(transcript, sessionId) {
  if (!transcript || !transcript.raw || transcript.raw.length < 100) return null

  const prompt = `Analyze this conversation transcript and extract ALL structured knowledge. Be THOROUGH.

Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of what happened",
  "decisions": [{"what": "decision", "why": "rationale", "context": ""}],
  "problems": [{"problem": "issue encountered", "solution": "how resolved", "root_cause": "underlying cause"}],
  "code_patterns": [{"name": "pattern name", "usage": "when to use", "example": "code snippet"}],
  "user_preferences": [{"what": "preference", "evidence": "how we know"}],
  "project_knowledge": [{"topic": "area", "detail": "specific knowledge"}],
  "open_issues": [{"issue": "unresolved", "status": "open|blocked"}],
  "procedural_candidates": [{"name": "workflow", "trigger": "when to use", "steps": ["step1","step2"]}]
}

Transcript:
${transcript.raw.substring(0, 8000)}`

  try {
    const result = await callDeepSeek([{ role: 'user', content: prompt }])
    const json = result.replace(/```json\n?|```/g, '').trim()
    const start = json.indexOf('{'), end = json.lastIndexOf('}') + 1
    return JSON.parse(json.substring(start, end))
  } catch(e) {
    return null
  }
}

function saveEpisodicFile(sessionId, transcript) {
  const f = path.join(EPISODIC_DIR, `${sessionId}.json`)
  fs.writeFileSync(f, JSON.stringify({ sessionId, messages: transcript.messages, savedAt: new Date().toISOString() }, null, 2), 'utf-8')
  return f
}

function projectContext() {
  let ctx = [`工作目录: ${process.cwd()}`]
  try {
    const files = fs.readdirSync(process.cwd()).filter(f => !f.startsWith('.')).slice(0, 15)
    ctx.push(`文件: ${files.join(', ')}`)
  } catch(e) {}
  return ctx.join('\n')
}

function getSkillCore(skill) {
  // Try flat .md files first (skills/all/)
  const allDir = path.join(ROOT, 'skills', 'all')
  try {
    const files = fs.readdirSync(allDir)
    const match = files.find(f => f === `${skill.name}.md`)
    if (match) {
      const content = fs.readFileSync(path.join(allDir, match), 'utf-8')
      const m = content.match(/^---[\s\S]*?---\n([\s\S]+)/)
      if (m) return m[1].replace(/#/g, '').trim().substring(0, 300)
    }
  } catch(e) {}
  const subPath = path.join(ROOT, 'skills', skill.name, 'SKILL.md')
  try {
    const content = fs.readFileSync(subPath, 'utf-8')
    const m = content.match(/^---[\s\S]*?---\n([\s\S]+)/)
    if (m) return m[1].replace(/#/g, '').trim().substring(0, 300)
  } catch(e) {}
  return ''
}

function loadPreviousEpisode() {
  try {
    const files = fs.readdirSync(EPISODIC_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(EPISODIC_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)
    if (files.length < 1) return null
    const data = JSON.parse(fs.readFileSync(path.join(EPISODIC_DIR, files[0].name), 'utf-8'))
    return data.summary || null
  } catch(e) { return null }
}

// Get last few exchanges from current transcript for short-term context
function getRecentContext() {
  try {
    const files = fs.readdirSync(TRANSCRIPT_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(TRANSCRIPT_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime)
    if (!files.length) return ''

    const latest = path.join(TRANSCRIPT_DIR, files[0].name)
    const raw = fs.readFileSync(latest, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)

    // Read last 50 entries from tail, extract user + assistant text
    const recent = []
    for (let i = Math.max(0, lines.length - 50); i < lines.length; i++) {
      try {
        const e = JSON.parse(lines[i])
        const msg = e.message
        if (!msg || !msg.role) continue
        const role = msg.role
        let txt = ''
        if (typeof msg.content === 'string') txt = msg.content
        else if (Array.isArray(msg.content)) {
          const tb = msg.content.find(b => b.type === 'text')
          if (tb) txt = tb.text
        }
        if (txt && txt.length > 5 && !txt.includes('parentUuid') && !txt.includes('sidechain')) {
          recent.push(`[${role}] ${txt.substring(0, 120)}`)
        }
      } catch(e) {}
    }
    return recent.slice(-6).join('\n')
  } catch(e) { return '' }
}

function buildInjection(mems, skills, stats, projCtx, userTask, issueMems, taskPlan, skillStatus, warningText) {
  const planText = taskPlan ? `\n## 执行计划\n${taskPlan}` : ''
  const progressText = issueMems.length > 0
    ? `\n## 未解决问题\n${issueMems.slice(0, 3).map(m => `- ${m.key}: ${m.content?.substring(0, 150)}`).join('\n')}`
    : ''

  const memText = mems.filter(m => !(m.key || '').startsWith('issue_')).slice(0, 5).map(m => `- ${m.key}: ${m.content?.substring(0, 200)}`).join('\n')

  const warningSection = warningText || ''

  const skillText = skills.slice(0, 3).map(s => {
    const core = getSkillCore(s)
    return `### ${s.name}\n${core || s.description?.substring(0, 200)}`
  }).join('\n\n')

  const prevEpisode = loadPreviousEpisode()
  const continuityText = prevEpisode ? `\n## 上次对话\n${prevEpisode.substring(0, 300)}` : ''

  const recentContext = getRecentContext()
  const recentText = recentContext ? `\n## 最近消息\n${recentContext}` : ''

  const hasSkills = skills.length > 0
  const mandatory = hasSkills
    ? `## 直接执行以下指令（已注入完整内容，无需查文件）\n\n${skillText}`
    : ''

  const statusLine = skillStatus || (hasSkills ? `已注入 ${skills.length} 个技能` : '未注入技能')

  return `# Xuanlin Overmind

## 当前任务
${userTask || '(未检测到)'}

## 项目上下文
${projCtx}
${continuityText}
${recentText}

${planText}

${warningSection}

${mandatory}

${progressText}

## 相关记忆
${memText || '- 暂无相关记忆'}

## 技能注入
${statusLine}

## 状态
语义${stats.semanticCount}条 技能${stats.skillCount}个 情景${stats.episodeCount}个

> 遇到技术问题先用 MCP search_memory 查记忆，再回答。`
}

async function main() {
  // Global injector mutex — only one inject.js runs at a time
  const INJECTOR_LOCK = path.join(ROOT, '.injector.lock')
  let lockFd = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      lockFd = fs.openSync(INJECTOR_LOCK, 'wx')
      fs.writeSync(lockFd, String(process.pid))
      break
    } catch(e) {
      if (e.code === 'EEXIST') {
        try {
          const t = fs.statSync(INJECTOR_LOCK).mtimeMs
          if (Date.now() - t > 90000) { fs.unlinkSync(INJECTOR_LOCK) } // stale lock >90s
        } catch(e2) {}
        return // another injector running, exit
      }
      throw e
    }
  }
  if (!lockFd) return
  const releaseLock = () => { try { fs.closeSync(lockFd); fs.unlinkSync(INJECTOR_LOCK) } catch(e) {} }

  const index = require(path.join(ROOT, 'index'))
  index.init()
  index.ensureMemoryDirs()

  // Check if worker is already running — only spawn if not
  const pidFile = path.join(ROOT, '.worker.pid')
  let workerAlive = false
  try {
    const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'))
    if (oldPid > 0) {
      try { process.kill(oldPid, 0); workerAlive = true } catch(e) { /* PID not running */ }
    }
  } catch(e) {}

  if (!workerAlive) {
    const { spawn } = require('child_process')
    const worker = spawn('wscript.exe', [path.join(ROOT, 'launcher.vbs')], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true
    })
    worker.unref()
    var workerSpawned = true
  } else {
    var workerSpawned = false
  }

  const stats = index.getStats()
  const userTask = getUserTask()
  const projCtx = projectContext()
  const searchQuery = userTask || projCtx
  const keywordMems = index.searchHybrid(searchQuery, 8)
  const allMemKeys = index.getAllMemoryKeys()

  // Compute unresolved issues from all memories
  const issueMems = allMemKeys.filter(m =>
    (m.key || '').startsWith('issue_') ||
    (m.key || '').includes('blocker') ||
    (m.key || '').includes('unresolved') ||
    (m.content || '').includes('待解决') ||
    (m.content || '').includes('阻塞') ||
    (m.content || '').includes('未解决') ||
    (m.content || '').includes('尚未解决')
  )

  const logFile = path.join(ROOT, 'inject.log')
  // Phase 0: Quick warning check (local graph query, no API) — for lite injection
  let liteWarningText = ''
  try {
    const graph = require(path.join(ROOT, 'graph'))
    const quickFb = {}
    for (const m of allMemKeys) {
      quickFb[m.key] = { effectiveness: m.effectiveness_score || 0.5, injected_count: m.injected_count || 0, ineffective_count: m.ineffective_count || 0 }
    }
    const quickWarnings = graph.getWarnings(keywordMems.map(m => m.key), quickFb)
    if (quickWarnings.length > 0) {
      liteWarningText = graph.formatWarnings(quickWarnings, 5)
    }
  } catch(e) {}

  // Phase 1: Write lite injection immediately — fast, zero API delay
  const liteMems = keywordMems.slice(0, 5)
  const liteDoc = buildInjection(liteMems, [], stats, projCtx, userTask, issueMems, null, '⏳ AI 筛选中…', liteWarningText)
  writeInjection(liteDoc)
  fs.appendFileSync(logFile, `${new Date().toISOString()} inject(lite): ${liteDoc.length} chars mem=${stats.semanticCount} worker=${workerSpawned ? 'spawned' : 'already_running'}\n`)

  // Phase 2: Run AI skill + memory + decomposition in PARALLEL
  const allSkills = index.getAllSkills()
  let skills = [], skillMethod = 'none', aiSaidEmpty = false
  let mems = liteMems, memMethod = 'keyword'
  let taskPlan = null

  // Phase 2: Run AI skill + memory + decomposition in PARALLEL

  const [aiSkillsResult, aiMemsResult, aiDecompResult] = await Promise.allSettled([
    Promise.race([
      selectSkillsAI(userTask, projCtx, allSkills),
      new Promise(r => setTimeout(() => r('timeout'), 60000))
    ]),
    Promise.race([
      selectMemoriesAI(userTask, allMemKeys, 5),
      new Promise(r => setTimeout(() => r('timeout'), 60000))
    ]),
    Promise.race([
      decomposeTask(userTask, allMemKeys, issueMems),
      new Promise(r => setTimeout(() => r('timeout'), 60000))
    ])
  ])

  // Process skill results
  const aiResult = aiSkillsResult.value
  if (aiResult !== 'timeout' && Array.isArray(aiResult)) {
    if (aiResult.length > 0) { skills = aiResult; skillMethod = 'ai' }
    else { aiSaidEmpty = true; skillMethod = 'ai' }
  }
  // Process memory results
  const aiMems = aiMemsResult.value
  if (aiMems === 'timeout') {
    fs.appendFileSync(logFile, `${new Date().toISOString()} selectMemoriesAI: timeout\n`)
  } else if (Array.isArray(aiMems)) {
    if (aiMems.length > 0) {
      mems = aiMems
      memMethod = 'ai'
      fs.appendFileSync(logFile, `${new Date().toISOString()} selectMemoriesAI: picked [${aiMems.map(m=>m.key).join(',')}]\n`)
    } else {
      fs.appendFileSync(logFile, `${new Date().toISOString()} selectMemoriesAI: returned empty []\n`)
    }
  } else {
    fs.appendFileSync(logFile, `${new Date().toISOString()} selectMemoriesAI: unexpected result ${typeof aiMems}: ${JSON.stringify(aiMems).substring(0,100)}\n`)
  }

  // Only keyword fallback if API failed — not when AI said "no skills needed"
  if (skills.length === 0 && !aiSaidEmpty) {
    const taskSkills = index.searchSkills(searchQuery, 5)
    const projSkills = index.searchSkills(projCtx, 5)
    const skillsById = {}
    for (const s of [...taskSkills, ...projSkills]) {
      if (!skillsById[s.name]) skillsById[s.name] = s
    }
    skills = Object.values(skillsById).slice(0, 3)
    skillMethod = 'keyword'
  }

  // Process decomposition result
  const decompVal = aiDecompResult.value
  if (typeof decompVal === 'string' && decompVal.length > 10) {
    taskPlan = decompVal
    fs.appendFileSync(logFile, `${new Date().toISOString()} decomposeTask: plan generated (${decompVal.length} chars)\n`)
  }

  // Also keyword memory fallback if AI returned nothing
  if (mems.length === 0 || memMethod === 'keyword') {
    mems = keywordMems.slice(0, 5)
  }

  // ---- GRAPH EXPANSION ----
  let graphExpanded = false
  try {
    const graph = require(path.join(ROOT, 'graph'))
    const graphResult = graph.expandKeys(mems.map(m => m.key), 1)
    if (graphResult && graphResult.keys.length > mems.length) {
      // Find memory objects for expanded keys that aren't already in mems
      const existingKeys = new Set(mems.map(m => m.key))
      const newKeys = graphResult.keys.filter(k => !existingKeys.has(k))
      const newMems = newKeys.map(k => allMemKeys.find(m => m.key === k)).filter(Boolean)
      if (newMems.length > 0) {
        mems = [...mems, ...newMems]
        memMethod = memMethod + '+graph'
        graphExpanded = true
        fs.appendFileSync(logFile, `${new Date().toISOString()} graph: expanded +${newMems.length} keys: [${newMems.map(m=>m.key).join(',')}]\n`)
      }
    }
  } catch(e) {
    fs.appendFileSync(logFile, `${new Date().toISOString()} graph: expansion failed: ${e.message}\n`)
  }

  // ---- FEEDBACK: Record injections + rank by effectiveness ----
  try {
    // Record injected event for each memory
    const sessionId = `inj_${Date.now()}`
    for (const m of mems) {
      index.recordFeedback(m.key, 'injected', sessionId, `selected_by_${memMethod}`)
    }
    // Re-rank with effectiveness boost
    mems = index.rankByEffectiveness(mems)
    if (graphExpanded) {
      memMethod = memMethod.replace('+graph', '') + '+graph+feedback'
    } else {
      memMethod = memMethod + '+feedback'
    }
    fs.appendFileSync(logFile, `${new Date().toISOString()} feedback: recorded ${mems.length} injections, ranked by effectiveness\n`)
  } catch(e) {
    fs.appendFileSync(logFile, `${new Date().toISOString()} feedback: recording failed: ${e.message}\n`)
  }

  // ---- SKILL FEEDBACK: Record injections ----
  if (skills.length > 0) {
    try {
      const sessionId = `inj_${Date.now()}`
      for (const s of skills) {
        index.recordSkillFeedback(s.name, 'injected', userTask || projCtx, sessionId, 0.5)
      }
      // Sync skill prefs to shared file for AI agents
      index.syncSkillPrefsToFile()
      fs.appendFileSync(logFile, `${new Date().toISOString()} skill_fb: recorded ${skills.length} injections\n`)
    } catch(e) {
      fs.appendFileSync(logFile, `${new Date().toISOString()} skill_fb error: ${e.message}\n`)
    }
  }

  // ---- PROACTIVE GUARD: Warning detection ----
  let warningText = ''
  try {
    const graph = require(path.join(ROOT, 'graph'))
    // Build feedback lookup for current memories
    const feedbackLookup = {}
    for (const m of allMemKeys) {
      feedbackLookup[m.key] = {
        effectiveness: m.effectiveness_score || 0.5,
        injected_count: m.injected_count || 0,
        ineffective_count: m.ineffective_count || 0
      }
    }
    const memKeys = mems.map(m => m.key)
    const warnings = graph.getWarnings(memKeys, feedbackLookup)
    if (warnings.length > 0) {
      warningText = graph.formatWarnings(warnings, 5)
      fs.appendFileSync(logFile, `${new Date().toISOString()} guard: ${warnings.length} warnings found | high=${warnings.filter(w=>w.severity==='high').length} medium=${warnings.filter(w=>w.severity==='medium').length}\n`)
    }
  } catch(e) {
    fs.appendFileSync(logFile, `${new Date().toISOString()} guard: warning detection failed: ${e.message}\n`)
  }

  // Phase 3: Rewrite with better skills/memories if AI returned any
  const shouldRewrite = skills.length > 0 || memMethod.startsWith('ai') || graphExpanded
  if (shouldRewrite) {
    let skillStatus
    if (skills.length > 0) {
      skillStatus = `AI 注入 ${skills.length} 个: ${skills.map(s=>s.name).join(', ')}`
    } else if (aiSaidEmpty) {
      skillStatus = 'AI 判断无需技能'
    } else {
      skillStatus = '未匹配到合适技能'
    }
    const fullDoc = buildInjection(mems, skills, stats, projCtx, userTask, issueMems, taskPlan, skillStatus, warningText)
    writeInjection(fullDoc)
    fs.appendFileSync(logFile, `${new Date().toISOString()} inject(full): ${fullDoc.length} chars skills=[${skills.map(s=>s.name).join(',')}] sel=${skillMethod} mems=${memMethod} status=${skillStatus}\n`)
  } else {
    fs.appendFileSync(logFile, `${new Date().toISOString()} inject: no skills needed (lite kept) sel=${skillMethod} aiEmpty=${aiSaidEmpty} mems=${memMethod}\n`)
  }

  releaseLock()
}

try { main() } catch(e) {
  const logFile = path.join(ROOT, 'inject.log')
  fs.appendFileSync(logFile, `${new Date().toISOString()} inject ERROR: ${e.message}\n`)
  try { fs.unlinkSync(path.join(ROOT, '.injector.lock')) } catch(e2) {}
}
