const path = require('path')
const fs = require('fs')
const https = require('https')

process.on('unhandledRejection', (reason) => {
  try { fs.appendFileSync(path.join(__dirname, 'worker.log'), `${new Date().toISOString()} [worker] unhandledRejection: ${reason?.message || reason}\n`) } catch(e) {}
})

const ROOT = path.dirname(__filename)
const { shouldSkipExtraction } = require(path.join(ROOT, 'privacy_filter'))
const EPISODIC_DIR = path.join(ROOT, 'memory', 'episodic')
const adapter = require(path.join(ROOT, 'adapters')).getAgent()

const { getAPIConfig } = require('./config')

function callLLM(messages, useFlash = true) {
  return new Promise((resolve, reject) => {
    let cfg; try { cfg = getAPIConfig(useFlash) } catch(e) { reject(e); return }
    const body = cfg.bodyBuilder(Array.isArray(messages) ? messages : [{ role: 'user', content: messages }])
    const req = require('https').request({
      hostname: cfg.hostname, path: cfg.path, method: 'POST',
      headers: cfg.headers, timeout: cfg.timeout
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const obj = JSON.parse(data)
          if (obj.error) { reject(new Error(obj.error.message || 'API error')); return }
          if (cfg.format === 'openai') { resolve(obj.choices?.[0]?.message?.content || ''); return }
          const textBlock = obj.content?.find(c => c.type === 'text')
          resolve(textBlock ? textBlock.text : (obj.content?.[0]?.text || ''))
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function findCurrentTranscript() {
  try {
    if (!fs.existsSync(adapter.transcriptDir())) return null
    const files = fs.readdirSync(adapter.transcriptDir())
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(adapter.transcriptDir(), f)).mtimeMs, path: path.join(adapter.transcriptDir(), f) }))
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

  const prompt = `${getHermesPrompt()}

## 当前对话片段
${text}

## 已存记忆关键词（避免重复）
${getExistingKeys()}

请按格式输出每条新发现的事实。`

  try {
    const result = await callLLM([{ role: 'system', content: getHermesPrompt() }, { role: 'user', content: prompt }])
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
          const head = index.getGitHead()
          if (index.saveSemantic(fact.key, fact.content, fact.category || 'general', sessionId, fact.dedup_key, fact.confidence || 0.5, head)) {
            saved++
          }
        }
      } catch(e) {}
    }
    if (skipped > 0) log(`privacy filter: skipped ${skipped} facts`)
    if (skillDrafts > 0) {
      log(`skill drafts created: ${skillDrafts}`)
      const { spawn } = require('child_process')
      spawn('pythonw', ['-c', `import sys; sys.path.insert(0,'${ROOT}'); from daemon import index_skills; print(f'Re-indexed: {len(index_skills())} skills')`], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
    }

    // Injection refresh handled by CC hooks — removing redundant spawn
    // that caused triple-fire + lock contention + console flash every 30s

    // ---- GRAPH: Extract relationships from conversation ----
    try {
      const graph = require(path.join(ROOT, 'graph'))
      const allMems = index.getAllMemoryKeys()
      if (allMems.length >= 5) {
        const relPrompt = graph.buildExtractionPrompt(allMems, text)
        const relResult = await callLLM([{ role: 'user', content: relPrompt }])
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

      // Read injected skills for implicit detection
      let injectedSkillNames = ''
      try {
        const injContent = fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8')
        const re = /^### (\S+)/gm
        let m; const names = []
        while ((m = re.exec(injContent)) !== null) names.push(m[1])
        if (names.length > 0) injectedSkillNames = `\nSKILLS INJECTED THIS SESSION: ${names.join(', ')}\nCheck if these were used — even IMPLICITLY (assistant follows skill rules without naming it).`
      } catch(e) {}

      const skillPrefPrompt = `Analyze this conversation. Detect when a skill was used.${injectedSkillNames}

IMPORTANT — Implicit Usage: The assistant often follows a skill's rules WITHOUT naming it. Look for:
- Code style matches: zero comments + zero types + stdlib only = elon-code was used
- Thinking mentions: "从另一个角度看"/"反证" = lateral-jump was used
- Multi-path analysis: A/B/C 方案对比 = net-analyze was used
- The user said "用X" and the assistant's output matches X's style → X was used

Output format: SKILL_PREF: <skill_name> | <task_scenario> | <effectiveness_0_to_1>

Rules:
- skill_name: MUST be one of the injected skills above, or a skill name from the conversation
- task_scenario: SHORT task category (2-8 Chinese chars). Generalize.
- effectiveness: 0.9=completed, 0.7=partial, 0.3=failed
- Output ONLY SKILL_PREF lines. Nothing else.
- Output nothing if no skill usage detected.

Conversation:
${text.substring(0, 4000)}`

      const prefResult = await callLLM([{ role: 'user', content: skillPrefPrompt }])
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
        require('child_process').execSync(process.platform === 'win32' ? 'ping 127.0.0.1 -n 1 >nul' : 'sleep 0.05', {stdio:'ignore'})
      } else { log(`pid lock error: ${e.message}`); return }
    }
  }
  if (!pidFd) { log('could not acquire PID lock, exiting'); return }
  process.on('exit', () => { try { fs.closeSync(pidFd); fs.unlinkSync(pidFile) } catch(e) {} })

  try { require(path.join(ROOT, 'wiring')).init() } catch(e) {}
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
        // v4: emit extraction event
        try { require(path.join(ROOT, 'eventbus')).emit('memory:extracted', { count: saved, lines: lineCount, sessionId }) } catch(e) {}
        accumulatedLines = []
        startTime = Date.now()
      }

      // Autonomous research & dream phase
      const idle = Date.now() - lastContentTime
      const RESEARCH_IDLE = 5 * 60 * 1000
      const DREAM_IDLE = 10 * 60 * 1000

      if (idle > RESEARCH_IDLE && (Date.now() - lastConsolidationCheck) > RESEARCH_IDLE) {
        try {
          const index = require(path.join(ROOT, 'index'))
          // Lightweight research (local SQL)
          try {
            const research = require(path.join(ROOT, 'research'))
            const analysis = research.analyze(index)
            if (analysis && analysis.total_findings > 0) {
              fs.writeFileSync(path.join(ROOT, '.research_findings.json'), JSON.stringify(analysis, null, 2), 'utf-8')
              log(`research: ${analysis.total_findings} patterns found`)
            }
          } catch(e) { log(`research error: ${e.message}`) }

          // Dream phase (pro model) — idle >30min, once per 8 hours
          if (idle > DREAM_IDLE) {
            const dreamFile = path.join(ROOT, '.dream_findings.json')
            const shouldDream = !fs.existsSync(dreamFile) ||
              (Date.now() - fs.statSync(dreamFile).mtimeMs) > 2 * 60 * 60 * 1000
            if (shouldDream) {
              try {
                const dream = require(path.join(ROOT, 'dream'))
                const findings = await dream.dream(index)
                if (findings && findings.summary) log(`dream: ${findings.summary.substring(0, 100)}`)
              } catch(e) { log(`dream error: ${e.message}`) }
            }
          }
        } catch(e) { log(`research/dream error: ${e.message}`) }
      }

      // Session end: transcript idle >15min → auto-consolidate
      if (idle > SESSION_IDLE_TIMEOUT && (Date.now() - lastConsolidationCheck) > SESSION_IDLE_TIMEOUT) {
        lastConsolidationCheck = Date.now()
        const { spawn } = require('child_process')
        const cp = spawn('node', [path.join(ROOT, 'consolidate.js')], { windowsHide: true, detached: true,
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

  // Self-healing: periodic health check
  try {
    const healer = require(path.join(ROOT, 'healer'))
    healer.start(120000) // every 2 minutes
  } catch(e) {}

  // Adaptive interval — dynamic polling
  const adaptive = require(path.join(ROOT, 'adaptive'))
  let timer = setInterval(check, POLL_INTERVAL)
  // Check interval every 5 minutes and adjust
  setInterval(() => {
    const newInterval = adaptive.computeInterval(lastContentTime, accumulatedLines.length)
    if (Math.abs(newInterval - POLL_INTERVAL) > 10000) {
      // Interval would change significantly — restart timer
      clearInterval(timer)
      timer = setInterval(check, newInterval)
      log(`adaptive: interval adjusted to ${newInterval/1000}s`)
    }
  }, 300000)

  setTimeout(() => { clearInterval(timer); log('worker lifetime expired') }, MAX_LIFETIME)

  // Noise self-learner — periodic
  setInterval(() => {
    try {
      const nl = require(path.join(ROOT, 'noiselearner'))
      nl.learn(require(path.join(ROOT, 'index')))
    } catch(e) {}
  }, 600000)

  process.on('SIGTERM', () => {
    clearInterval(timer)
    log('worker graceful shutdown: checkpointing DBs')
    try { require(path.join(ROOT, 'pool')).checkpoint() } catch(e) {}
    process.exit(0)
  })
}

main().catch(e => log(`fatal: ${e.message}`))
