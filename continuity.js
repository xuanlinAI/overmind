// Cross-Session Continuity — detect task continuation across sessions
const path = require('path')
const ROOT = path.dirname(__filename)

function detect(index, userTask, issueMems) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // 1. Check for explicit continuation signals in user task
  const contSignal = /继续|接着|上次|之前|刚才|ongoing|continue/i.test(userTask || '')

  // 2. Check open issues from previous sessions
  const openIssues = (issueMems || []).filter(m =>
    (m.key || '').startsWith('issue_') ||
    (m.key || '').includes('blocker') ||
    (m.key || '').includes('unresolved') ||
    (m.content || '').includes('尚未解决')
  ).slice(0, 5)

  // 3. Check recent session episodes
  let lastSession = null
  try {
    const epDir = path.join(ROOT, 'memory', 'episodic')
    const fs = require('fs')
    if (fs.existsSync(epDir)) {
      const files = fs.readdirSync(epDir).filter(f => f.endsWith('.json'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(epDir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime)
      if (files.length > 0) {
        const ep = JSON.parse(fs.readFileSync(path.join(epDir, files[0].name), 'utf-8'))
        lastSession = ep.summary || null
      }
    }
  } catch(e) {}

  // 4. Check graph: what was being actively worked on
  let activeTopic = null
  try {
    // Find most recently accessed memories
    const recent = db.prepare(`SELECT key, content, last_accessed FROM semantic WHERE last_accessed IS NOT NULL ORDER BY last_accessed DESC LIMIT 5`).all()
    if (recent.length > 0) {
      const topics = [...new Set(recent.map(r => r.key.split('_').slice(0, 2).join('_')))]
      activeTopic = topics[0] || null
    }
  } catch(e) {}

  db.close()

  // Determine if this is a continuation
  const isContinuation = contSignal || (openIssues.length >= 2)

  return {
    is_continuation: isContinuation,
    open_issues: openIssues.map(i => ({ key: i.key, content: i.content?.substring(0, 120) })),
    last_session_summary: lastSession?.substring(0, 300),
    active_topic: activeTopic,
    signal: contSignal ? 'explicit_mention' : openIssues.length >= 2 ? 'open_issues' : 'none'
  }
}

function formatContinuity(cont) {
  if (!cont || !cont.is_continuation) return ''

  let text = '\n## 🔄 会话持续\n\n'

  if (cont.last_session_summary) {
    text += `上次会话: ${cont.last_session_summary}\n\n`
  }

  if (cont.open_issues.length > 0) {
    text += '### 仍待解决\n' + cont.open_issues.map(i =>
      `- ${i.key}: ${i.content?.substring(0, 100)}`
    ).join('\n') + '\n\n'
  }

  if (cont.active_topic) {
    text += `活跃主题: ${cont.active_topic}\n`
  }

  return text
}

module.exports = { detect, formatContinuity }
