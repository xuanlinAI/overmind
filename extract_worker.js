const path = require('path')
const fs = require('fs')
const https = require('https')

const ROOT = path.dirname(__filename)
const { shouldSkipExtraction } = require(path.join(ROOT, 'privacy_filter'))
const EPISODIC_DIR = path.join(ROOT, 'memory', 'episodic')
const TRANSCRIPT_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', 'D--claude')
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || 'YOUR_DEEPSEEK_API_KEY'
const LOG_FILE = path.join(ROOT, 'worker.log')
const HERMES_PROMPT = fs.readFileSync(path.join(ROOT, 'HERMES_PROMPT.md'), 'utf-8')
const POLL_INTERVAL = 30000
const MIN_NEW_LINES = 25
const MAX_LIFETIME = 8 * 60 * 60 * 1000

if (!fs.existsSync(EPISODIC_DIR)) fs.mkdirSync(EPISODIC_DIR, { recursive: true })

function log(msg) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [worker] ${msg}\n`)
}

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: messages,
      max_tokens: 16384,
      temperature: 0.1
    })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      timeout: 300000
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
          if (index.saveSemantic(fact.key, fact.content, fact.category || 'general', sessionId, fact.dedup_key, fact.confidence || 0.5)) {
            saved++
          }
        }
      } catch(e) {}
    }
    if (skipped > 0) log(`privacy filter: skipped ${skipped} facts`)
    if (skillDrafts > 0) {
      log(`skill drafts created: ${skillDrafts}`)
      try {
        const { execSync } = require('child_process')
        execSync(`python -c "import sys; sys.path.insert(0,'${ROOT}'); from daemon import index_skills; print(f'Re-indexed: {len(index_skills())} skills')"`, { timeout: 10000 })
      } catch(e) {}
    }

    // Regenerate injection.md with latest context
    try {
      const injectJS = path.join(ROOT, 'inject.js')
      const { execSync } = require('child_process')
      execSync(`node "${injectJS}"`, { timeout: 5000 })
    } catch(e) {}

    // ---- GRAPH: Extract relationships from conversation ----
    try {
      const graph = require(path.join(ROOT, 'graph'))
      const allMems = index.getAllMemoryKeys()
      if (allMems.length >= 5) {
        const relPrompt = graph.buildExtractionPrompt(allMems, text)
        const relResult = await callDeepSeek([{ role: 'user', content: relPrompt }])
        if (relResult) {
          const relations = graph.parseExtractionResult(relResult)
          if (relations.length > 0) {
            const added = graph.applyRelations(relations, sessionId)
            log(`graph: extracted ${added} relations from ${relations.length} candidates`)
          }
        }
      }
    } catch(e) {
      log(`graph extraction error: ${e.message}`)
    }

    // ---- SKILL PREFERENCE: Detect what skills were used for what tasks ----
    try {
      const allSkills = index.getAllSkills()
      const validNames = allSkills.map(s => s.name)

      const skillPrefPrompt = `Analyze this conversation. Detect when the user asked the assistant to use a specific skill for a task. The assistant may read skill files directly instead of using the Skill tool — look for skill names in the conversation.

Output format: SKILL_PREF: <skill_name> | <task_scenario> | <effectiveness_0_to_1>

Rules:
- skill_name: the skill the user asked for or the assistant used, as written in the conversation
- task_scenario: SHORT task category (2-8 Chinese chars). Generalize — "生成代码" not "写斐波那契", "逆向工程" not "破解某APP的AES", "安全分析" not "扫描SQL注入点". Be terse.
- effectiveness: 0.9=completed, 0.7=partial, 0.3=failed
- Output ONLY SKILL_PREF lines. Nothing else.
- Output nothing if no skill was used.

Conversation:
${text.substring(0, 4000)}`

      const prefResult = await callDeepSeek([{ role: 'user', content: skillPrefPrompt }])
      if (prefResult) {
        const prefLines = prefResult.split('\n').filter(l => l.startsWith('SKILL_PREF:'))
        for (const line of prefLines) {
          const m = line.match(/^SKILL_PREF:\s*(\S+)\s*\|\s*(.+?)\s*\|\s*([\d.]+)/)
          if (m) {
            let skillName = m[1].trim()
            let taskPattern = m[2].trim()
            const eff = parseFloat(m[3]) || 0.7

            // Normalize: extract core task category
            const clean = taskPattern.replace(/[的之地得和与了在是]/g, '').replace(/[a-zA-Z0-9_\-\.\/]+/g, '').trim()
            const pair = clean.match(/(逆向|安全|代码|网络|系统|数据|性能|前端|后端|数据库|API|加密|合约|协议|内存|进程|流量|抓包|令牌|分析|编写|生成)(分析|工程|审查|审计|测试|调试|开发|配置|优化|代码|管理|检测|追踪|提取|破解|脚本)/)
            if (pair) {
              taskPattern = pair[0]
            } else if (clean.length > 8) {
              taskPattern = clean.substring(0, 8)
            }

            // Fuzzy match: find the closest real skill name
            const matched = fuzzyMatchSkill(skillName, validNames)
            if (matched) {
              index.upsertSkillPref(matched, taskPattern, eff)
            }
          }
        }
        if (prefLines.length > 0) {
          index.syncSkillPrefsToFile()
          log(`skill_prefs: detected ${prefLines.length} usage patterns`)
        } else {
          log(`skill_prefs: API responded but no SKILL_PREF lines (${prefResult.substring(0, 100).replace(/\n/g, ' ')})`)
        }
      } else {
        log(`skill_prefs: API returned empty response`)
      }
    } catch(e) {
      log(`skill_pref extraction error: ${e.message}`)
    }

  return saved
  } catch(e) {
    log(`extract error: ${e.message}`)
    return 0
  }
}

function fuzzyMatchSkill(name, validNames) {
  if (validNames.includes(name)) return name
  const norm = (s) => s.toLowerCase().replace(/[-_\s]/g, '')
  const target = norm(name)
  for (const v of validNames) {
    if (norm(v) === target) return v
  }
  for (const v of validNames) {
    const nv = norm(v)
    const ratio = Math.min(target.length, nv.length) / Math.max(target.length, nv.length)
    if (ratio >= 0.4 && (nv.includes(target) || target.includes(nv))) return v
  }
  const aliases = {
    'elonmask': 'elon-code', 'elonmusk': 'elon-code', 'elon': 'elon-code',
    'superpower': 'using-superpowers', 'superpowers': 'using-superpowers',
    'netanalyze': 'net-analyze', 'lateraljump': 'lateral-jump',
  }
  if (aliases[target]) return aliases[target]
  return null
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
  // Singleton guard — atomic PID file prevents race between workers
  const pidFile = path.join(ROOT, '.worker.pid')
  let pidFd = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      pidFd = fs.openSync(pidFile, 'wx')
      fs.writeSync(pidFd, String(process.pid))
      break
    } catch(e) {
      if (e.code === 'EEXIST') {
        try {
          const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'))
          try { process.kill(oldPid, 'SIGTERM') } catch(e) {}
        } catch(e) {}
        try { fs.unlinkSync(pidFile) } catch(e) {}
        require('child_process').execSync('sleep 0.05')
      } else { log(`pid lock error: ${e.message}`); return }
    }
  }
  if (!pidFd) { log('could not acquire PID lock, exiting'); return }
  process.on('exit', () => { try { fs.closeSync(pidFd); fs.unlinkSync(pidFile) } catch(e) {} })

  log('worker started (watch mode)')
  const transcript = findCurrentTranscript()
  if (!transcript) { log('no transcript found'); return }

  log(`watching: ${transcript.name}`)
  let lastPos = fs.statSync(transcript.path).size
  let accumulatedLines = []
  let startTime = Date.now()
  let lastContentTime = Date.now()
  let lastConsolidationCheck = 0
  const SESSION_IDLE_TIMEOUT = 15 * 60 * 1000

  const check = async () => {
    try {
      const { lines, newPos } = loadNewLines(transcript.path, lastPos)
      if (lines.length > 0) {
        accumulatedLines.push(...lines)
        lastPos = newPos
        lastContentTime = Date.now()
      }

      const shouldExtract = accumulatedLines.length >= MIN_NEW_LINES ||
        (accumulatedLines.length > 0 && lines.length === 0 && Date.now() - startTime > 60000)

      if (shouldExtract && accumulatedLines.length > 0) {
        const sessionId = 'incr_' + Date.now()
        const lineCount = accumulatedLines.length
        const saved = await extractAndSave(accumulatedLines, sessionId)
        log(`incremental: ${saved} facts from ${lineCount} lines`)
        accumulatedLines = []
        startTime = Date.now()
      }

      // Session end: transcript idle >15min → auto-consolidate
      const idle = Date.now() - lastContentTime
      if (idle > SESSION_IDLE_TIMEOUT && (Date.now() - lastConsolidationCheck) > SESSION_IDLE_TIMEOUT) {
        lastConsolidationCheck = Date.now()
        const { spawn } = require('child_process')
        const cp = spawn('node', [path.join(ROOT, 'consolidate.js')], {
          cwd: ROOT, timeout: 120000, stdio: 'pipe'
        })
        let out = ''
        cp.stdout.on('data', c => out += c)
        cp.on('close', code => {
          if (code === 0) log(`session_end(worker): ${out.trim().substring(0, 200)}`)
          else log(`session_end(worker): exit ${code}`)
        })
        cp.on('error', e => log(`session_end(worker) failed: ${e.message}`))
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
