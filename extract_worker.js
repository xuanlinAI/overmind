const path = require('path')
const fs = require('fs')
const https = require('https')

const ROOT = path.dirname(__filename)
const { shouldSkipExtraction } = require(path.join(ROOT, 'privacy_filter'))
const EPISODIC_DIR = path.join(ROOT, 'memory', 'episodic')
const TRANSCRIPT_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', 'D--claude')
const API_KEY = process.env.DEEPSEEK_API_KEY || ''
const LOG_FILE = path.join(ROOT, 'hook.log')
const HERMES_PROMPT = fs.readFileSync(path.join(ROOT, 'HERMES_PROMPT.md'), 'utf-8')
const POLL_INTERVAL = 10000
const MIN_NEW_LINES = 50
const MAX_LIFETIME = 8 * 60 * 60 * 1000

if (!fs.existsSync(EPISODIC_DIR)) fs.mkdirSync(EPISODIC_DIR, { recursive: true })

function log(msg) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [worker] ${msg}\n`)
}

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 4096,
      temperature: 0.1
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

function findCurrentTranscript() {
  try {
    if (!fs.existsSync(TRANSCRIPT_DIR)) return null
    const files = fs.readdirSync(TRANSCRIPT_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(TRANSCRIPT_DIR, f)).mtimeMs, path: path.join(TRANSCRIPT_DIR, f) }))
      .sort((a, b) => b.mtime - a.mtime)
    return files[0] || null
  } catch(e) { return null }
}

function loadNewLines(filepath, lastPos) {
  try {
    const stat = fs.statSync(filepath)
    if (stat.size <= lastPos) return { lines: [], newPos: lastPos }
    const fd = fs.openSync(filepath, 'r')
    fs.readSync(fd, Buffer.alloc(0), 0, 0, lastPos)
    const buf = Buffer.alloc(stat.size - lastPos)
    fs.readSync(fd, buf, 0, buf.length, lastPos)
    fs.closeSync(fd)
    const text = buf.toString('utf-8')
    const lines = text.split('\n').filter(Boolean)
    return { lines, newPos: stat.size }
  } catch(e) { return { lines: [], newPos: lastPos } }
}

function compressForExtraction(lines, maxChars) {
  const msgs = []
  for (let i = 0; i < lines.length && msgs.length < 100; i++) {
    try {
      const obj = JSON.parse(lines[i])
      const msg = obj.message || {}
      const role = msg.role || 'unknown'
      let content = msg.content || ''
      if (typeof content !== 'string') content = JSON.stringify(content)
      if (content) msgs.push(`[${role}] ${content.substring(0, 800)}`)
    } catch(e) {}
  }
  const text = msgs.join('\n')
  if (text.length <= maxChars) return text
  return text.substring(0, maxChars)
}

async function extractAndSave(lines, sessionId) {
  const text = compressForExtraction(lines, 30000)
  if (text.length < 200) return 0

  const prompt = `${HERMES_PROMPT}

## 当前对话片段
${text}

## 已存记忆关键词（避免重复）
${getExistingKeys()}

请按格式输出每条新发现的事实。`

  try {
    const result = await callDeepSeek([{ role: 'system', content: HERMES_PROMPT }, { role: 'user', content: prompt }])
    if (!result) return 0

    const index = require(path.join(ROOT, 'index'))
    index.init()
    index.ensureMemoryDirs()

    let saved = 0, skipped = 0, skillDrafts = 0
    const lines = result.split('\n').filter(l => l.trim().startsWith('{'))
    for (const line of lines) {
      try {
        const fact = JSON.parse(line.trim())
        // Check for procedural_candidate / skill draft format
        if (fact.type === 'procedural' && fact.name && fact.steps) {
          const skillPath = path.join(ROOT, 'skills', 'all', `${fact.name}.md`)
          const triggerStr = fact.trigger || ''
          const stepsStr = Array.isArray(fact.steps) ? fact.steps.join('\n') : String(fact.steps)
          const content = `---\nname: ${fact.name}\ndescription: ${fact.trigger || fact.name}\ntriggers: ${triggerStr}\n---\n\n# ${fact.name}\n\n${fact.trigger || ''}\n\n## Steps\n${stepsStr}`
          if (!fs.existsSync(skillPath)) {
            fs.writeFileSync(skillPath, content, 'utf-8')
            index.logEvolution(sessionId, 'skill_draft', { name: fact.name })
            skillDrafts++
          }
          continue
        }
        if (fact.key && fact.content && fact.is_new !== false) {
          if (shouldSkipExtraction(fact.content)) { skipped++; continue }
          index.saveSemantic(fact.key, fact.content, fact.category || 'general', sessionId)
          saved++
        }
      } catch(e) {}
    }
    if (skipped > 0) log(`privacy filter: skipped ${skipped} facts`)
    if (skillDrafts > 0) {
      log(`skill drafts created: ${skillDrafts}`)
      // Trigger daemon re-index
      try {
        const { execSync } = require('child_process')
        execSync(`python -c "import sys; sys.path.insert(0,'${ROOT}'); from daemon import index_skills; print(f'Re-indexed: {len(index_skills())} skills')"`, { timeout: 10000 })
      } catch(e) {}
    }
    return saved
  } catch(e) {
    log(`extract error: ${e.message}`)
    return 0
  }
}

function getExistingKeys() {
  try {
    const index = require(path.join(ROOT, 'index'))
    index.init()
    const db = index.db || require('better-sqlite3')(index.DB_PATH)
    const rows = db.prepare('SELECT key FROM semantic LIMIT 200').all()
    return rows.map(r => r.key).join(', ')
  } catch(e) { return '' }
}

// Main watch loop
async function main() {
  log('worker started (watch mode)')
  const transcript = findCurrentTranscript()
  if (!transcript) { log('no transcript found'); return }

  log(`watching: ${transcript.name}`)
  let lastPos = fs.statSync(transcript.path).size
  let accumulatedLines = []
  let startTime = Date.now()

  const check = async () => {
    try {
      const { lines, newPos } = loadNewLines(transcript.path, lastPos)
      if (lines.length > 0) {
        accumulatedLines.push(...lines)
        lastPos = newPos
      }

      const shouldExtract = accumulatedLines.length >= MIN_NEW_LINES ||
        (accumulatedLines.length > 0 && lines.length === 0 && Date.now() - startTime > 60000)

      if (shouldExtract && accumulatedLines.length > 0) {
        const sessionId = 'incr_' + Date.now()
        const saved = await extractAndSave(accumulatedLines, sessionId)
        if (saved > 0) {
          log(`incremental: ${saved} facts from ${accumulatedLines.length} lines`)
          accumulatedLines = []
        }
        startTime = Date.now()
      }
    } catch(e) {
      log(`check error: ${e.message}`)
    }
  }

  const timer = setInterval(check, POLL_INTERVAL)
  setTimeout(() => { clearInterval(timer); log('worker lifetime expired') }, MAX_LIFETIME)

  process.on('SIGTERM', () => { clearInterval(timer); process.exit(0) })
}

main().catch(e => log(`fatal: ${e.message}`))
