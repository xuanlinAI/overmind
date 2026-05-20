// Predictive Preload — pre-load skills + graph before AI selection
// Safety: only preload if confidence ≥ 0.6, never block AI, always label as "预判"
const path = require('path')
const ROOT = path.dirname(__filename)

function preload(prediction, index, graph, intent) {
  const hints = { skills: [], warnings: [], memories: [] }
  if (!prediction || prediction.confidence < 0.6) return hints

  const taskHint = prediction.task_hint || ''

  // 1. Pre-load skills based on task hint (keyword, cheap)
  try {
    const scored = index.searchSkills(taskHint, 8)
    for (const s of scored) {
      if (s.score > 1.5) {
        hints.skills.push({
          name: s.name,
          score: s.score,
          reason: `意图预判: ${taskHint} (置信度 ${(prediction.confidence*100).toFixed(0)}%)`,
          preloaded: true
        })
      }
    }
  } catch(e) {}

  // 2. Pre-check graph warnings for task domain
  try {
    const fbLookup = getFeedbackLookup(index)
    for (const skill of hints.skills) {
      const warnings = graph.getWarnings([skill.name], fbLookup)
      if (warnings.length > 0) {
        hints.warnings.push({
          skill: skill.name,
          warnings: warnings.slice(0, 3).map(w => ({ type: w.danger_type, reason: w.reason?.substring(0, 100) }))
        })
      }
    }
  } catch(e) {}

  // 3. Pre-load relevant memories
  try {
    const mems = index.searchHybrid(taskHint, 5)
    if (mems.length > 0) {
      hints.memories.push(...mems.map(m => ({ key: m.key, content: m.content?.substring(0, 120) })))
    }
  } catch(e) {}

  // Mark all as preload (not definitive)
  hints.preload = true
  hints.prediction_confidence = prediction.confidence
  hints.warning = '以下基于意图预判，未经验证。若与当前任务不匹配，请忽略。'

  return hints
}

function formatPreload(hints) {
  if (!hints || !hints.preload) return ''

  let text = '\n## ⚡ 预判加载\n\n'
  text += `> ${hints.warning}\n\n`

  if (hints.skills.length > 0) {
    text += '### 预加载技能\n' + hints.skills.map(s =>
      `- ${s.name} (置信度 ${s.score}, ${s.reason})`
    ).join('\n') + '\n\n'
  }

  if (hints.warnings.length > 0) {
    text += '### 预检警告\n' + hints.warnings.map(w =>
      `- ${w.skill}: ${w.warnings.map(ww => ww.reason).join(' | ')}`
    ).join('\n') + '\n\n'
  }

  if (hints.memories.length > 0) {
    text += '### 预取记忆\n' + hints.memories.map(m =>
      `- ${m.key}: ${m.content?.substring(0, 100)}`
    ).join('\n') + '\n'
  }

  return text
}

function getFeedbackLookup(index) {
  try {
    const allMems = index.getAllMemoryKeys()
    const lookup = {}
    for (const m of allMems) {
      lookup[m.key] = {
        effectiveness: m.effectiveness_score || 0.5,
        injected_count: m.injected_count || 0,
        ineffective_count: m.ineffective_count || 0
      }
    }
    return lookup
  } catch(e) { return {} }
}

module.exports = { preload, formatPreload }
