// Morning Brief — "what happened while you were away"
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)
const LAST_ACTIVE = path.join(ROOT, '.last_active')

function generate() {
  // When was the user last active?
  let lastActive = Date.now() - 3600000
  try { lastActive = parseInt(fs.readFileSync(LAST_ACTIVE, 'utf-8')) } catch(e) {}

  const idleMinutes = Math.round((Date.now() - lastActive) / 60000)
  if (idleMinutes < 30) return null // Too recent, no brief needed

  // Gather what happened since
  const updates = []

  // Dream findings
  try {
    const dreamFile = path.join(ROOT, '.dream_findings.json')
    if (fs.existsSync(dreamFile)) {
      const dream = JSON.parse(fs.readFileSync(dreamFile, 'utf-8'))
      if (new Date(dream.dreamed_at).getTime() > lastActive) {
        updates.push({ type: 'dream', text: `梦境研究完成: ${dream.summary?.substring(0,120)}` })
      }
    }
  } catch(e) {}

  // Research findings
  try {
    const rf = path.join(ROOT, '.research_findings.json')
    if (fs.existsSync(rf)) {
      const research = JSON.parse(fs.readFileSync(rf, 'utf-8'))
      if (new Date(research.analyzed_at).getTime() > lastActive) {
        updates.push({ type: 'research', text: `自主研究发现 ${research.total_findings} 个模式` })
      }
    }
  } catch(e) {}

  // Recent injections
  try {
    const logFile = path.join(ROOT, 'inject.log')
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean)
      const recent = lines.slice(-5).filter(l => {
        const ts = l.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
        return ts && new Date(ts[1]).getTime() > lastActive
      })
      if (recent.length > 0) updates.push({ type: 'injection', text: `${recent.length} 次上下文注入` })
    }
  } catch(e) {}

  // New memories added
  try {
    const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
    const count = db.prepare("SELECT COUNT(*) as c FROM semantic WHERE created_at > datetime(?, 'unixepoch')").get(lastActive / 1000).c
    db.close()
    if (count > 0) updates.push({ type: 'memory', text: `新增 ${count} 条记忆` })
  } catch(e) {}

  return {
    away_minutes: idleMinutes,
    updates,
    summary: updates.length > 0
      ? `你离开了 ${Math.round(idleMinutes/60)}h${idleMinutes%60}m。这期间: ${updates.map(u=>u.text).join('; ')}。`
      : `你离开了 ${Math.round(idleMinutes/60)}h${idleMinutes%60}m。无重大变化。`
  }
}

function touch() {
  fs.writeFileSync(LAST_ACTIVE, String(Date.now()))
}

function format(brief) {
  if (!brief || brief.away_minutes < 30) return ''
  return `\n## 🌅 早安简报\n\n${brief.summary}\n`
}

module.exports = { generate, touch, format }
