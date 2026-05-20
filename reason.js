// Chain-of-Thought Transparency — explain WHY each injection decision
const path = require('path')
const ROOT = path.dirname(__filename)

function explainSkills(skills, prediction, prefs, allSkills) {
  if (!skills || skills.length === 0) return null
  const lines = ['## 🧠 思维链', '', '以下展示超脑为何选择这些技能：', '']

  for (const s of skills) {
    const reasons = []
    // Reason 1: Keyword match score
    if (s.score !== undefined) reasons.push(`关键词匹配度 ${s.score?.toFixed(1)}`)
    // Reason 2: Preference data
    const pref = (prefs || []).find(p => p.includes && p.includes(s.name))
    if (pref) reasons.push(`历史偏好 — 曾用于类似任务 (有效率 ${(pref.effectiveness*100).toFixed(0)}%)`)
    // Reason 3: Intent prediction alignment
    if (prediction && prediction.task_hint) {
      const hint = prediction.task_hint.toLowerCase()
      const desc = (s.description || '').toLowerCase()
      if (desc.includes(hint) || hint.split(/\s+/).some(w => desc.includes(w))) {
        reasons.push(`意图预判匹配 — 预判任务 "${prediction.task_hint}" (置信度 ${(prediction.confidence*100).toFixed(0)}%)`)
      }
    }

    // Find alternatives
    const alternatives = (allSkills || []).filter(a => a.name !== s.name && a.score && a.score > 0)
      .sort((a,b) => (b.score||0) - (a.score||0)).slice(0, 2)

    lines.push(`### ${s.name}`)
    lines.push(`**选择理由:** ${reasons.join(' · ')}`)
    if (alternatives.length > 0) {
      const altNames = alternatives.map(a => `${a.name}(${a.score?.toFixed(1)})`).join(', ')
      lines.push(`**备选但未选:** ${altNames}`)
    }
    if (s.not_why) lines.push(`**弃因:** ${s.not_why}`)
    lines.push('')
  }

  lines.push('> 数据驱动，非黑盒。')
  return lines.join('\n')
}

function explainMemories(mems, keywordMems) {
  if (!mems || mems.length === 0) return null
  const lines = ['### 记忆选择依据', '']

  for (const m of mems.slice(0, 5)) {
    const reasons = []
    if (m.effectiveness_score && m.effectiveness_score > 0.6) reasons.push(`高效记忆 (有效率 ${(m.effectiveness_score*100).toFixed(0)}%)`)
    if (m.injected_count && m.injected_count > 2) reasons.push(`多次验证 (注入 ${m.injected_count} 次)`)
    if (m.kscore) reasons.push(`关键词匹配 ${m.kscore?.toFixed(1)}`)

    const wasKeyword = (keywordMems || []).some(k => k.key === m.key)
    const wasAI = !wasKeyword
    const source = wasAI ? 'AI 精选' : '关键词'

    lines.push(`- **${m.key}** — ${source}${reasons.length ? ' · ' + reasons.join(' · ') : ''}`)
  }

  return lines.join('\n')
}

module.exports = { explainSkills, explainMemories }
