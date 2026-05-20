// Clarify Threshold — force clarifying questions when ambiguity is high
const path = require('path'), ROOT = path.dirname(__filename)

function check(userTask, index, toml) {
  if (!userTask || userTask.length > 100) return null // detailed enough

  let ambiguity = 0
  const reasons = []

  // 1. Too short / missing referents
  if (userTask.length < 15) { ambiguity += 0.4; reasons.push('任务描述过短') }
  if (!/[a-zA-Z]{3,}/.test(userTask)) { ambiguity += 0.2; reasons.push('缺少具体术语') }

  // 2. Vague keywords
  const vague = [/修一下/, /改一改/, /搞一下/, /处理/, /看看/, /检查/, /fix/i, /bug/i, /issue/i]
  for (const p of vague) { if (p.test(userTask)) { ambiguity += 0.3; reasons.push(`触发模糊词: ${p.source}`); break } }

  // 3. Multiple interpretations from KG
  try {
    index.init()
    const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
    const words = userTask.split(/\s+/).filter(w => w.length > 2)
    let matches = 0
    for (const w of words) {
      const c = db.prepare('SELECT COUNT(*) as c FROM semantic WHERE key LIKE ? OR content LIKE ?').get(`%${w}%`, `%${w}%`).c
      if (c > 5) matches++
    }
    db.close()
    if (matches >= 3) { ambiguity += 0.2; reasons.push(`多种可能匹配 (${matches} 个方向)`) }
  } catch(e) {}

  if (ambiguity < 0.5) return null

  return {
    ambiguity: Math.min(1, ambiguity).toFixed(2),
    reasons,
    directive: `[强制] 模糊度 ${(ambiguity*100).toFixed(0)}%。先问 2-3 个澄清问题，再动手。不要猜测用户的意图。`
  }
}

function format(result) {
  if (!result) return ''
  return `\n## ❓ 澄清阈值\n\n${result.directive}\n` +
    `**原因:** ${result.reasons.join(' · ')}\n`
}

module.exports = { check, format }
