const path = require('path')
const fs = require('fs')
const https = require('https')

const ROOT = path.dirname(__filename)
const INJECTION_FILE = path.join(ROOT, 'injection.md')
const EPISODIC_DIR = path.join(ROOT, 'memory', 'episodic')
const TRANSCRIPT_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', 'D--claude')
const API_KEY = process.env.DEEPSEEK_API_KEY || ''

if (!fs.existsSync(EPISODIC_DIR)) fs.mkdirSync(EPISODIC_DIR, { recursive: true })

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-pro[1m]',
      max_tokens: 4096,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/anthropic/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data).content[0].text) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
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

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.type !== 'user') continue
        const msg = entry.message
        if (!msg) continue
        if (typeof msg === 'string') return msg
        if (typeof msg.content === 'string') return msg.content
        if (Array.isArray(msg.content)) {
          const tb = msg.content.find(b => b.type === 'text')
          if (tb) return tb.text
        }
      } catch(e) {}
    }
    return null
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
      if (m) return m[1].replace(/#/g, '').trim().substring(0, 200)
    }
  } catch(e) {}
  // Try subdirectory SKILL.md (skills/{name}/SKILL.md)
  const subPath = path.join(ROOT, 'skills', skill.name, 'SKILL.md')
  try {
    const content = fs.readFileSync(subPath, 'utf-8')
    const m = content.match(/^---[\s\S]*?---\n([\s\S]+)/)
    if (m) return m[1].replace(/#/g, '').trim().substring(0, 200)
  } catch(e) {}
  return ''
}

function buildInjection(mems, skills, stats, projCtx, userTask) {
  const memText = mems.slice(0, 5).map(m => `- ${m.key}: ${m.content?.substring(0, 200)}`).join('\n')
  const skillText = skills.slice(0, 3).map(s => {
    const core = getSkillCore(s)
    return `- /${s.name} — 调用方式: Skill({skill: "${s.name}"})\n  ${s.description?.substring(0, 80)}\n  ${core}`
  }).join('\n')

  const hasSkills = skills.length > 0
  const mandatory = hasSkills
    ? `## 强制技能调用 — 必须执行，禁止跳过
优先调用 Skill 工具。如果 CC 报 Unknown skill，从文件读取：
\`d:/claude/context-proxy/skills/all/{技能名}.md\`
按文件内的指令手动执行。

${skillText}`
    : '## 无匹配技能 — 直接执行即可'

  return `# Context Proxy Injection

## 执行规则
当上方推荐技能时，你必须执行——优先用 Skill 工具，失败则读外挂文件按指令手动执行。不能跳过。

## 当前任务
${userTask || '(未检测到)'}

## 项目上下文
${projCtx}

${mandatory}

## 相关记忆
${memText || '- 暂无相关记忆'}

## 状态
语义${stats.semanticCount}条 技能${stats.skillCount}个 情景${stats.episodeCount}个`

}

function main() {
  const index = require(path.join(ROOT, 'index'))
  index.init()
  index.ensureMemoryDirs()

  // Spawn async extraction worker (fire-and-forget, doesn't block)
  const { spawn } = require('child_process')
  const worker = spawn('node', [path.join(ROOT, 'extract_worker.js')], {
    stdio: 'ignore',
    detached: true,
    windowsHide: true
  })
  worker.unref()

  const stats = index.getStats()
  const userTask = getUserTask()
  const projCtx = projectContext()
  const searchQuery = userTask || projCtx
  const mems = index.searchHybrid(searchQuery, 8)
  const skills = index.searchSkills(searchQuery, 5)

  const doc = buildInjection(mems, skills, stats, projCtx, userTask)
  fs.writeFileSync(INJECTION_FILE, doc, 'utf-8')

  const logFile = path.join(ROOT, 'hook.log')
  fs.appendFileSync(logFile, `${new Date().toISOString()} inject: ${doc.length} chars mem=${stats.semanticCount} skill=${stats.skillCount} worker=spawned\n`)
}

try { main() } catch(e) {
  const logFile = path.join(ROOT, 'hook.log')
  fs.appendFileSync(logFile, `${new Date().toISOString()} inject ERROR: ${e.message}\n`)
}
