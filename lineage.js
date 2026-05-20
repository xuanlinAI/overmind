// Skill Lineage — complete lifecycle tracking for each skill
const path = require('path')
const ROOT = path.dirname(__filename)

function trace(index, skillName) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Get skill metadata
  const skill = db.prepare('SELECT * FROM skill_index WHERE name = ?').get(skillName)
  if (!skill) return null

  // Get usage stats
  const feedback = db.prepare(`SELECT event_type, COUNT(*) as cnt, AVG(effectiveness) as avg_eff FROM skill_feedback WHERE skill_name = ? GROUP BY event_type`).all(skillName)
  const fbMap = {}
  for (const f of feedback) fbMap[f.event_type] = { count: f.cnt, avg_effectiveness: f.avg_eff?.toFixed(2) }

  // Get preference data
  const prefs = db.prepare('SELECT task_pattern, use_count, effectiveness, last_used FROM skill_prefs WHERE skill_name = ? ORDER BY use_count DESC LIMIT 10').all(skillName)

  // Get composition chains this skill participates in
  let chains = []
  try {
    const allChains = db.prepare("SELECT task_pattern FROM skill_prefs WHERE task_pattern LIKE '% → %'").all()
    for (const c of allChains) {
      const parts = c.task_pattern.split(' → ')
      if (parts.includes(skillName)) {
        chains.push({ chain: c.task_pattern, position: parts.indexOf(skillName) + 1, length: parts.length })
      }
    }
  } catch(e) {}

  // Skill file modification history (from filesystem)
  let fileHistory = null
  try {
    const fs = require('fs')
    const fp = skill.file_path
    if (fs.existsSync(fp)) {
      const stat = fs.statSync(fp)
      fileHistory = {
        size: stat.size,
        created: stat.birthtime?.toISOString() || 'unknown',
        modified: stat.mtime.toISOString()
      }
    }
  } catch(e) {}

  // Compute overall effectiveness
  const completed = fbMap.completed?.count || 0
  const failed = fbMap.failed?.count || 0
  const totalUses = completed + failed
  const successRate = totalUses > 0 ? (completed / totalUses * 100).toFixed(0) + '%' : 'N/A'

  db.close()

  return {
    name: skillName,
    installed: skill.installed_at,
    last_invoked: skill.last_invoked,
    version: skill.version || '1.0.0',
    description: skill.description?.substring(0, 200),
    triggers: skill.triggers,
    quality_score: skill.quality_score,
    stats: {
      total_invocations: totalUses,
      completed, failed,
      not_used: fbMap.not_used?.count || 0,
      success_rate: successRate,
      effectiveness_breakdown: fbMap
    },
    preferences: prefs?.slice(0, 5),
    chains: chains?.slice(0, 5),
    file_info: fileHistory
  }
}

function formatLineage(lineage) {
  if (!lineage) return ''
  const s = lineage

  return `\n## 📜 技能血统: ${s.name}\n\n` +
    `创建: ${s.installed || '未知'} | 版本: ${s.version} | 质量分: ${s.quality_score || 'N/A'}\n\n` +
    `### 使用统计\n` +
    `调用 ${s.stats.total_invocations} 次 | 成功 ${s.stats.completed} | 失败 ${s.stats.failed} | 成功率 ${s.stats.success_rate}\n\n` +
    (s.preferences?.length ? `### 偏好场景\n${s.preferences.map(p => `- ${p.task_pattern}: ${p.use_count}次, 有效率${(p.effectiveness*100).toFixed(0)}%`).join('\n')}\n\n` : '') +
    (s.chains?.length ? `### 编排链\n${s.chains.map(c => `- ${c.chain} (第${c.position}/${c.length}步)`).join('\n')}\n` : '')
}

module.exports = { trace, formatLineage }
