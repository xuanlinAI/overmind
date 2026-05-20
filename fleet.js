const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__filename)

function exportMemory(outputPath) {
  const index = require(path.join(ROOT, 'index'))
  index.init()

  // Export semantic memories only (no personal data)
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
  const mems = db.prepare(`
    SELECT key, content, tags, confidence, effectiveness_score, access_count, commit_hash
    FROM semantic WHERE key != '_schema_version'
    AND tags NOT LIKE '%deprecated%' AND tags NOT LIKE '%privacy%'
    AND content NOT LIKE '%D:/%' AND content NOT LIKE '%C:/%'
    ORDER BY confidence DESC LIMIT 500
  `).all()

  const skills = db.prepare('SELECT name, description, triggers, file_path FROM skill_index LIMIT 200').all()

  const data = {
    exported_at: new Date().toISOString(),
    source: ROOT,
    semantic_count: mems.length,
    skill_count: skills.length,
    memories: mems,
    skills,
    graph_snapshot: []
  }

  // Export graph edges (anonymized)
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    data.graph_snapshot = gdb.prepare(`
      SELECT source, target, relation_type, confidence FROM edges WHERE confidence >= 0.5 LIMIT 200
    `).all()
    gdb.close()
  } catch(e) {}

  db.close()

  const filepath = outputPath || path.join(ROOT, 'fleet_export.json')
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8')
  return { file: filepath, memories: mems.length, skills: skills.length, edges: data.graph_snapshot.length }
}

function importMemory(inputPath) {
  if (!fs.existsSync(inputPath)) return { imported: 0, reason: 'file not found' }

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'))
  if (!data.memories) return { imported: 0, reason: 'invalid format' }

  const index = require(path.join(ROOT, 'index'))
  index.init()

  let imported = 0, skipped = 0
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  for (const m of data.memories) {
    const existing = db.prepare('SELECT key FROM semantic WHERE key = ?').get(m.key)
    if (existing) { skipped++; continue }

    db.prepare('INSERT OR IGNORE INTO semantic (key, content, tags, confidence, effectiveness_score, access_count, commit_hash) VALUES (?,?,?,?,?,?,?)')
      .run(m.key, m.content, (m.tags || '') + ',fleet-import', m.confidence || 0.5, m.effectiveness_score || 0.5, 0, m.commit_hash || null)
    imported++
  }

  // Import skills
  for (const s of (data.skills || [])) {
    const existing = db.prepare('SELECT name FROM skill_index WHERE name = ?').get(s.name)
    if (existing) continue
    db.prepare('INSERT OR IGNORE INTO skill_index (name, description, triggers, file_path) VALUES (?,?,?,?)')
      .run(s.name, s.description, s.triggers, s.file_path || '')
  }

  // Import graph edges
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    const graph = require(path.join(ROOT, 'graph'))
    for (const e of (data.graph_snapshot || [])) {
      graph.upsertEdge(e.source, e.target, e.relation_type, e.confidence)
    }
    gdb.close()
  } catch(e) {}

  db.close()
  return { imported, skipped, total: data.memories.length }
}

function syncShared(filepath, intervalMs = 60000) {
  if (!fs.existsSync(filepath)) return

  let lastMtime = 0
  setInterval(() => {
    try {
      const stat = fs.statSync(filepath)
      if (stat.mtimeMs <= lastMtime) return
      lastMtime = stat.mtimeMs

      const result = importMemory(filepath)
      if (result.imported > 0) {
        fs.appendFileSync(path.join(ROOT, 'worker.log'),
          `${new Date().toISOString()} [fleet] sync: +${result.imported} memories\n`)
      }
    } catch(e) {}
  }, intervalMs)
}

module.exports = { exportMemory, importMemory, syncShared }
