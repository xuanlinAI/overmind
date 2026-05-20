const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__filename)

function detectChains(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Find consecutive skill usage in the same session
  const events = db.prepare(`
    SELECT session_id, skill_name, event_type, created_at FROM skill_feedback
    WHERE event_type IN ('invoked','completed')
    ORDER BY session_id, created_at
  `).all()

  // Group by session
  const sessionChains = {}
  for (const e of events) {
    if (!sessionChains[e.session_id]) sessionChains[e.session_id] = []
    if (e.skill_name && !sessionChains[e.session_id].includes(e.skill_name)) {
      sessionChains[e.session_id].push(e.skill_name)
    }
  }

  // Count chain frequencies (skill A → skill B)
  const chainFreq = {}
  for (const [, skills] of Object.entries(sessionChains)) {
    if (skills.length < 2) continue
    for (let i = 0; i < skills.length - 1; i++) {
      const pair = `${skills[i]} → ${skills[i+1]}`
      chainFreq[pair] = (chainFreq[pair] || 0) + 1
    }
  }

  // Find chains that repeat 2+ times
  const chains = Object.entries(chainFreq)
    .filter(([, cnt]) => cnt >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  // Generate meta-skill names for top chains
  const metaSkills = []
  for (const [chain, count] of chains) {
    const skills = chain.split(' → ')
    const name = skills.join('-').replace(/\s+/g, '-')
    const desc = `自动编排: ${skills.join(' → ')} (发现 ${count} 次)`

    // Check if meta-skill already exists
    const exists = db.prepare('SELECT skill_name FROM skill_prefs WHERE task_pattern = ?').get(desc)
    if (!exists) {
      metaSkills.push({ name, chain: skills, count, description: desc })
    }
  }

  db.close()
  return { chains: metaSkills, total_patterns: Object.keys(chainFreq).length }
}

function createMetaSkill(meta) {
  const skillDir = path.join(ROOT, 'skills', 'all')
  if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true })

  const filename = `${meta.name}_composed.md`
  const stepsText = meta.chain.map((s, i) => `${i+1}. 调用 Skill(${s}) — ${s}`).join('\n')

  const content = `---
name: ${meta.name}
description: 自动编排技能链 — ${meta.description}
triggers: ${meta.chain.join(', ')}
---

# ${meta.name}

自动发现的技能编排。在你的工作流中出现 ${meta.count} 次。

## 步骤

${stepsText}

## 来源

Overmind Skill Composer 自动检测。
`

  const filepath = path.join(skillDir, filename)
  fs.writeFileSync(filepath, content, 'utf-8')

  // Index the new skill
  try {
    const index = require(path.join(ROOT, 'index'))
    index.init()
    const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
    db.prepare('INSERT OR REPLACE INTO skill_index (name, description, triggers, file_path) VALUES (?,?,?,?)')
      .run(meta.name, meta.description || '', (meta.chain || []).join(', '), filepath)
    db.close()
  } catch(e) {}

  return { created: true, path: filepath }
}

function formatChains(result) {
  if (!result || result.chains.length === 0) return ''
  return '\n## 🎼 技能编排\n\n发现 ' + result.total_patterns + ' 个技能使用模式：\n\n' +
    result.chains.slice(0, 5).map(c =>
      `- **${c.chain.join(' → ')}** (${c.count}次)`
    ).join('\n') + '\n'
}

module.exports = { detectChains, createMetaSkill, formatChains }
