const fs = require('fs')
const path = require('path')
const https = require('https')

const ROOT = path.dirname(__filename)
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || 'YOUR_DEEPSEEK_API_KEY'

function callAPI(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-pro[1m]',
      max_tokens: 1024,
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
          if (body.error) { reject(new Error(body.error.message)); return }
          const textBlock = body.content?.find(c => c.type === 'text')
          resolve(textBlock ? textBlock.text : (body.content?.[0]?.text || ''))
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function consolidate() {
  const index = require(path.join(ROOT, 'index'))
  index.init()
  index.ensureMemoryDirs()

  const sessionId = `s${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const stats = index.getStats()

  // Read current injection for context
  const injFile = path.join(ROOT, 'injection.md')
  let context = ''
  try { context = fs.readFileSync(injFile, 'utf-8').substring(0, 3000) } catch(e) {}

  // Generate episode summary via AI for session continuity
  if (context) {
    try {
      const epPrompt = `Summarize this Claude Code session in 2-3 sentences in Chinese. Focus on: what was accomplished, key decisions made, and what's pending. Be concise.

Session context:
${context.substring(0, 2000)}`

      const epSummary = await callAPI([{ role: 'user', content: epPrompt }])
      if (epSummary) {
        const epData = {
          sessionId,
          summary: epSummary.trim(),
          savedAt: new Date().toISOString(),
          stats: { semantic: stats.semanticCount, procedural: stats.proceduralCount, skills: stats.skillCount }
        }
        const epFile = path.join(ROOT, 'memory', 'episodic', `${sessionId}.json`)
        fs.writeFileSync(epFile, JSON.stringify(epData, null, 2), 'utf-8')
        process.stdout.write(`[overmind] episode saved: ${epSummary.substring(0, 80)}...\n`)
      }
    } catch(e) {
      process.stdout.write(`[overmind] episode summary failed: ${e.message}\n`)
    }
  }

  // Extract key facts from session (always run, not just when <100 mems)
  if (context) {
    try {
      const prompt = `Extract 3 key reusable facts from this Claude Code session context. Focus on: technical conclusions, project decisions, lessons learned. Output one per line: key: content

${context.substring(0, 2000)}`

      const result = await callAPI([{ role: 'user', content: prompt }])
      const lines = result.split('\n').filter(l => l.includes(': '))
      let extracted = 0
      for (const line of lines) {
        const m = line.match(/^([\w_]+):\s*(.+)/)
        if (m) {
          index.saveSemantic(m[1], m[2].trim())
          index.logEvolution(sessionId, 'extract', { key: m[1] })
          extracted++
        }
      }
      process.stdout.write(`[overmind] extracted ${extracted} facts from session\n`)
    } catch(e) {
      process.stdout.write(`[overmind] session extraction failed: ${e.message}\n`)
    }
  }

  // ---- FEEDBACK: Analyze which injected memories were used ----
  try {
    // Read injection.md to find injected memory keys
    const injContent = fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8')
    const injectedKeys = []
    const re = /^-\s+(\w+):/gm
    let m
    while ((m = re.exec(injContent)) !== null) {
      injectedKeys.push(m[1])
    }

    if (injectedKeys.length > 0) {
      // Read current transcript to detect references
      const transcriptDir = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', 'D--claude')
      let transcriptText = ''
      try {
        const files = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.jsonl'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(transcriptDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime)
        if (files.length > 0) {
          const raw = fs.readFileSync(path.join(transcriptDir, files[0].name), 'utf-8')
          const lines = raw.split('\n').filter(Boolean)
          transcriptText = lines.slice(-200).map(l => {
            try { return JSON.parse(l).message?.content || '' } catch(e) { return l.substring(0, 200) }
          }).join('\n')
        }
      } catch(e) {}

      // Detect which injected memories were referenced
      const refs = index.detectMemoryReferences(injectedKeys, transcriptText)
      const refKeys = new Set(refs.map(r => r.key))

      for (const key of injectedKeys) {
        if (refKeys.has(key)) {
          index.recordFeedback(key, 'referenced', sessionId, 'found_in_transcript')
          index.recordFeedback(key, 'helped', sessionId, 'session_used_memory')
        }
      }

      if (refs.length > 0) {
        process.stdout.write(`[overmind] feedback: ${refs.length}/${injectedKeys.length} memories referenced, recorded helped\n`)
      }
    }
  } catch(e) {
    process.stdout.write(`[overmind] feedback analysis error: ${e.message}\n`)
  }

  // ---- SKILL FEEDBACK: Detect invocation + completion ----
  try {
    // Find injected skills from injection.md
    const injContent = fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8')
    const injectedSkills = []
    const skillRe = /^### (\S+)/gm
    let sm
    while ((sm = skillRe.exec(injContent)) !== null) {
      injectedSkills.push(sm[1])
    }

    if (injectedSkills.length > 0) {
      // Read transcript for detection
      const transcriptDir = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', 'D--claude')
      let transcriptText = ''
      try {
        const files = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.jsonl'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(transcriptDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime)
        if (files.length > 0) {
          const raw = fs.readFileSync(path.join(transcriptDir, files[0].name), 'utf-8')
          transcriptText = raw.substring(Math.max(0, raw.length - 8000))
        }
      } catch(e) {}

      // Signal 1: Detect Skill tool invocation
      const invokedSkills = []
      for (const sn of injectedSkills) {
        // Check if skill name appears near Skill tool call pattern
        const pattern = new RegExp(`Skill\\(\\{[^}]*skill["']?\\s*:\\s*["']${sn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i')
        if (pattern.test(transcriptText)) {
          invokedSkills.push(sn)
          index.recordSkillFeedback(sn, 'invoked', '', sessionId, 0.8)
        }
      }

      // Signal 2: Detect task completion
      const completionSignals = [
        /完成|好了|搞定|done|fixed?|resolved?|success/i,
        /✅|🎉|👍/,
        /it works?|working now|no more error/i
      ]
      const failureSignals = [
        /不行|不对|没用|错误|失败|error|crash|bug/i,
        /重来|换个|再试|doesn't work|still broken/i
      ]
      const hasCompletion = completionSignals.some(p => p.test(transcriptText))
      const hasFailure = failureSignals.some(p => p.test(transcriptText))

      // Only mark completed if completion signals dominate
      if (hasCompletion && !hasFailure && invokedSkills.length > 0) {
        for (const sn of invokedSkills) {
          index.recordSkillFeedback(sn, 'completed', '', sessionId, 0.9)
        }
        process.stdout.write(`[overmind] skill_fb: ${invokedSkills.length} skills completed\n`)
      } else if (invokedSkills.length > 0) {
        for (const sn of invokedSkills) {
          index.recordSkillFeedback(sn, 'failed', '', sessionId, 0.2)
        }
      }

      // Record not_used for injected skills that weren't invoked
      for (const sn of injectedSkills) {
        if (!invokedSkills.includes(sn)) {
          index.recordSkillFeedback(sn, 'not_used', '', sessionId, 0.3)
        }
      }

      // Sync skill prefs to shared file
      index.syncSkillPrefsToFile()
    }
  } catch(e) {
    process.stdout.write(`[overmind] skill_fb error: ${e.message}\n`)
  }

  // ---- GRAPH: Ensure graph module is loaded ----
  try {
    const graph = require(path.join(ROOT, 'graph'))
    graph.init()
  } catch(e) {}

  // Compact and log
  const compacted = index.compactMemories()
  index.logEvolution(sessionId, 'session_end', { compacted })

  // Auto-run hermes_fusion every ~5 sessions to keep memory healthy
  let lastCount = 0
  try { lastCount = parseInt(fs.readFileSync(HERMES_COUNT_FILE, 'utf-8')) } catch(e) {}
  if (stats.semanticCount > lastCount + 300) {
    try {
      const { execSync } = require('child_process')
      const pyCmd = 'import daemon,json; print(json.dumps(daemon.hermes_fusion()))'
      const result = execSync(`python -c "${pyCmd}"`, {
        cwd: ROOT, timeout: 90000, encoding: 'utf-8'
      })
      process.stdout.write(`[overmind] hermes_fusion: ${result.trim()}\n`)
      fs.writeFileSync(HERMES_COUNT_FILE, String(stats.semanticCount))
    } catch(e) {
      process.stdout.write(`[overmind] hermes_fusion failed: ${e.message}\n`)
    }
  }

  const afterStats = index.getStats()
  process.stdout.write(`[overmind] session ${sessionId} done | mems: ${stats.semanticCount}→${afterStats.semanticCount} | episode: saved\n`)
}

const HERMES_COUNT_FILE = path.join(ROOT, '.hermes_counter')

async function main() {
  const logFile = path.join(ROOT, 'consolidate.log')
  fs.appendFileSync(logFile, `${new Date().toISOString()} SessionEnd START\n`)
  try {
    await consolidate()
    fs.appendFileSync(logFile, `${new Date().toISOString()} SessionEnd DONE\n`)
  } catch(e) {
    fs.appendFileSync(logFile, `${new Date().toISOString()} SessionEnd ERROR: ${e.message}\n`)
  }
}

main()
