const path = require('path')
const ROOT = path.dirname(__filename)

function resolve(index, graph) {
  index.init()
  graph.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  const conflicts = []
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    const edges = gdb.prepare(`SELECT source, target, confidence, evidence FROM edges
      WHERE relation_type = 'conflicts_with' AND confidence >= 0.4
      ORDER BY confidence DESC LIMIT 20`).all()
    gdb.close()

    for (const e of edges) {
      const memA = db.prepare("SELECT key, content, COALESCE(confidence,0.5) as conf, COALESCE(effectiveness_score,0.5) as eff, updated_at FROM semantic WHERE key = ?").get(e.source)
      const memB = db.prepare("SELECT key, content, COALESCE(confidence,0.5) as conf, COALESCE(effectiveness_score,0.5) as eff, updated_at FROM semantic WHERE key = ?").get(e.target)
      if (!memA || !memB) continue

      // Arbitration rules
      let winner = null, loser = null, reason = ''

      // Rule 1: newer wins if >7 days apart
      const dateA = new Date(memA.updated_at || '2020-01-01')
      const dateB = new Date(memB.updated_at || '2020-01-01')
      const daysDiff = Math.abs(dateA - dateB) / 86400000

      // Rule 2: effectiveness wins
      if (Math.abs(memA.eff - memB.eff) > 0.3) {
        if (memA.eff > memB.eff) { winner = memA; loser = memB; reason = '有效率显著更高' }
        else { winner = memB; loser = memA; reason = '有效率显著更高' }
      }
      // Rule 3: confidence + recency combined
      else if (daysDiff > 7) {
        if (dateA > dateB) { winner = memA; loser = memB; reason = `更新 ${daysDiff.toFixed(0)} 天` }
        else { winner = memB; loser = memA; reason = `更新 ${daysDiff.toFixed(0)} 天` }
      }
      // Rule 4: confidence wins
      else if (Math.abs(memA.conf - memB.conf) > 0.2) {
        if (memA.conf > memB.conf) { winner = memA; loser = memB; reason = '置信度更高' }
        else { winner = memB; loser = memA; reason = '置信度更高' }
      }

      if (winner && loser) {
        // Boost winner confidence, penalize loser
        db.prepare("UPDATE semantic SET confidence = MIN(1.0, COALESCE(confidence,0.5) + 0.15) WHERE key = ?").run(winner.key)
        db.prepare("UPDATE semantic SET confidence = MAX(0.1, COALESCE(confidence,0.5) - 0.25) WHERE key = ?").run(loser.key)
        db.prepare("UPDATE semantic SET tags = COALESCE(tags,'') || ',deprecated' WHERE key = ? AND COALESCE(confidence,0.5) < 0.25").run(loser.key)

        conflicts.push({
          conflict: `${e.source} ↔ ${e.target}`,
          winner: winner.key,
          loser: loser.key,
          reason,
          winner_content: winner.content?.substring(0, 100),
          loser_content: loser.content?.substring(0, 100)
        })

        // Update graph edge to record resolution
        try {
          const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
          gdb.prepare("UPDATE edges SET evidence = COALESCE(evidence,'') || ' | Resolved: ' || ? || ' wins (' || ? || ')' WHERE source = ? AND target = ? AND relation_type = 'conflicts_with'")
            .run(winner.key, reason, e.source, e.target)
          gdb.close()
        } catch(e) {}
      }
    }
  } catch(e) {}

  db.close()
  return {
    resolved: conflicts.length,
    conflicts,
    summary: conflicts.length > 0
      ? `仲裁了 ${conflicts.length} 个冲突: ${conflicts.map(c => `${c.loser}→${c.winner}(${c.reason})`).join(', ')}`
      : '无待仲裁冲突'
  }
}

function formatResolution(result) {
  if (!result || result.resolved === 0) return ''
  return '\n## ⚖️ 冲突仲裁\n\n' +
    result.conflicts.map(c =>
      `- **${c.winner}** 胜出 (${c.reason})\n  - 降级: ${c.loser}\n  - 胜方: ${c.winner_content}\n  - 败方: ${c.loser_content}`
    ).join('\n\n') + '\n'
}

module.exports = { resolve, formatResolution }
