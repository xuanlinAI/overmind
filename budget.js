// Memory Budget Manager — score, protect, archive memories
const path = require('path')
const ROOT = path.dirname(__filename)

function scoreMemory(mem) {
  const eff = mem.effectiveness_score || 0.5
  const access = mem.access_count || 0
  const injected = mem.injected_count || 0
  const ineffective = mem.ineffective_count || 0
  const age = mem.age_days || 0

  // Marginal value score (0-1)
  let score = eff * 0.35          // 35% — how often it helps when injected
    + Math.min(access / 20, 1) * 0.25  // 25% — access frequency (capped at 20)
    + Math.min(injected / 10, 1) * 0.2 // 20% — how often we thought it'd be useful
    + (1 - Math.min(age / 90, 1)) * 0.1 // 10% — recency (newer = better)
    + (1 - Math.min(ineffective / 5, 1)) * 0.1 // 10% — penalty for being useless

  // Penalize deprecated/compressed/stale tags
  const tags = (mem.tags || '').toLowerCase()
  if (tags.includes('deprecated')) score *= 0.3
  if (tags.includes('compressed')) score *= 0.5
  if (tags.includes('stale')) score *= 0.6

  return Math.round(score * 100) / 100
}

function classify(mem) {
  const score = scoreMemory(mem)
  if (score >= 0.7) return 'protected'   // High value — never archive
  if (score >= 0.4) return 'normal'       // Normal — inject if relevant
  if (score >= 0.2) return 'low'          // Low — inject only if directly matching
  return 'archive'                         // Trash — move to archive
}

function analyze(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  const allMems = db.prepare(`
    SELECT key, content, tags,
      COALESCE(effectiveness_score,0.5) as eff,
      COALESCE(access_count,0) as access,
      COALESCE(injected_count,0) as injected,
      COALESCE(ineffective_count,0) as ineffective,
      CAST(julianday('now') - julianday(COALESCE(created_at, datetime('now'))) AS INTEGER) as age_days
    FROM semantic WHERE key != '_schema_version' AND tags NOT LIKE '%deprecated%'
  `).all()

  const distribution = { protected: 0, normal: 0, low: 0, archive: 0 }
  const archiveList = []

  for (const m of allMems) {
    const cls = classify(m)
    distribution[cls]++
    if (cls === 'archive') {
      archiveList.push({ key: m.key, score: scoreMemory(m), content: m.content?.substring(0, 80) })
    }
  }

  // Auto-archive low-value memories
  let archived = 0
  if (archiveList.length > 0) {
    const archiveDir = path.join(ROOT, 'memory', 'archive')
    try { require('fs').mkdirSync(archiveDir, { recursive: true }) } catch(e) {}
    const archiveFile = path.join(archiveDir, `budget_${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
    require('fs').writeFileSync(archiveFile, JSON.stringify(archiveList, null, 2))

    // Only archive if total memories > 2000 (don't starve small DBs)
    if (allMems.length > 2000 && archiveList.length > 50) {
      const toArchive = archiveList.slice(0, Math.min(100, archiveList.length))
      for (const a of toArchive) {
        db.prepare("UPDATE semantic SET tags = COALESCE(tags,'') || ',budget-archived' WHERE key = ?").run(a.key)
      }
      archived = toArchive.length
    }
  }

  db.close()

  return {
    total: allMems.length,
    distribution,
    archived,
    top_protected: allMems
      .filter(m => classify(m) === 'protected')
      .sort((a, b) => scoreMemory(b) - scoreMemory(a))
      .slice(0, 5)
      .map(m => ({ key: m.key, score: scoreMemory(m) }))
  }
}

function formatBudget(budget) {
  if (!budget || budget.total < 100) return ''
  return '\n## 📊 记忆预算\n\n' +
    `共 ${budget.total} 条记忆 | 🛡️保护:${budget.distribution.protected} | 📋正常:${budget.distribution.normal} | 📉低价值:${budget.distribution.low} | 🗑️归档:${budget.archived}\n` +
    (budget.top_protected.length ? `\n核心记忆: ${budget.top_protected.map(m => m.key).join(', ')}\n` : '')
}

module.exports = { scoreMemory, classify, analyze, formatBudget }
