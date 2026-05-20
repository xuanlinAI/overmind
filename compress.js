const path = require('path')
const ROOT = path.dirname(__filename)

function compress(index, minClusterSize = 3) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Find clusters by key prefix (everything before last '_' or first 20 chars)
  const clusters = db.prepare(`SELECT
    substr(key, 1, length(key) - instr(replace(key,'_',''),'_')+2) as prefix,
    COUNT(*) as cnt, GROUP_CONCAT(key) as keys
    FROM semantic WHERE key != '_schema_version' AND tags NOT LIKE '%compressed%' AND tags NOT LIKE '%deprecated%'
    GROUP BY prefix HAVING cnt >= ? ORDER BY cnt DESC LIMIT 20`).all(minClusterSize)

  let merged = 0
  const results = []

  for (const cluster of clusters) {
    const keys = cluster.keys.split(',')
    if (keys.length < minClusterSize) continue

    const mems = []
    for (const k of keys) {
      const m = db.prepare('SELECT key, content, tags, COALESCE(effectiveness_score,0.5) as eff, COALESCE(confidence,0.5) as conf, access_count, created_at, updated_at FROM semantic WHERE key = ?').get(k)
      if (m) mems.push(m)
    }
    if (mems.length < 2) continue

    // Compute average effectiveness and confidence
    const avgEff = mems.reduce((s, m) => s + m.eff, 0) / mems.length
    const avgConf = mems.reduce((s, m) => s + m.conf, 0) / mems.length
    const totalAccess = mems.reduce((s, m) => s + (m.access_count || 0), 0)

    // Extract common themes
    const contents = mems.map(m => m.content).join(' | ')
    const summary = contents.length > 300
      ? contents.substring(0, 150) + ' ... ' + contents.substring(contents.length - 150)
      : contents

    // Create merged node
    const mergedKey = cluster.prefix.replace(/[_,]+$/, '') + '_summary'
    const mergedContent = `[综合 ${mems.length} 条相关记忆] ${summary.substring(0, 500)}`

    try {
      db.prepare('INSERT OR REPLACE INTO semantic (key, content, tags, confidence, effectiveness_score, access_count) VALUES (?,?,?,?,?,?)')
        .run(mergedKey, mergedContent, 'compressed,auto-merged', Math.min(1, avgConf + 0.1), avgEff, totalAccess)
      try { db.prepare("INSERT OR REPLACE INTO semantic_fts(key, content, tags) VALUES (?,?,?)").run(mergedKey, mergedContent, 'compressed') } catch(e) {}

      // Tag originals as compressed
      for (const m of mems) {
        db.prepare("UPDATE semantic SET tags = COALESCE(tags,'') || ',compressed', confidence = confidence * 0.5 WHERE key = ?").run(m.key)
        try { db.prepare("DELETE FROM semantic_fts WHERE rowid = (SELECT rowid FROM semantic_fts WHERE key = ?)").run(m.key) } catch(e) {}
      }

      merged++
      results.push({
        merged_key: mergedKey,
        original_count: mems.length,
        avg_effectiveness: Math.round(avgEff * 100) / 100,
        sample: mergedContent.substring(0, 120)
      })
    } catch(e) {}
  }

  // Log
  if (merged > 0) {
    try {
      index.logEvolution('system', 'compress', { merged, clusters: results.map(r => r.merged_key) })
    } catch(e) {}
  }

  db.close()
  return { merged, clusters_analyzed: clusters.length, results, saved_entries: results.reduce((s, r) => s + r.original_count - 1, 0) }
}

module.exports = { compress }
