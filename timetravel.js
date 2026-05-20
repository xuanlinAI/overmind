const path = require('path')
const ROOT = path.dirname(__filename)

function travel(index, dateOrCommit, topic = '') {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  let cutoff = dateOrCommit
  // If it's a commit hash, find its timestamp
  if (/^[a-f0-9]{7,40}$/.test(dateOrCommit)) {
    try {
      const ts = require('child_process').execSync(`git log -1 --format=%ai ${dateOrCommit}`, { encoding:'utf-8', timeout:3000, cwd: process.cwd() }).trim()
      if (ts) cutoff = ts
    } catch(e) {}
  }

  // Get all memories before cutoff
  const mems = db.prepare(`
    SELECT key, content, tags, created_at, COALESCE(confidence,0.5) as conf, commit_hash
    FROM semantic WHERE key != '_schema_version'
    AND created_at <= ? ${topic ? "AND (key LIKE ? OR content LIKE ?)" : ''}
    ORDER BY created_at DESC LIMIT 30
  `).all(cutoff, ...(topic ? [`%${topic}%`, `%${topic}%`] : []))

  // Get issues open at that time
  const issues = db.prepare(`
    SELECT key, content, created_at FROM semantic
    WHERE key != '_schema_version'
    AND (key LIKE '%issue_%' OR key LIKE '%blocker%' OR key LIKE '%unresolved%')
    AND created_at <= ?
    ORDER BY created_at DESC LIMIT 10
  `).all(cutoff)

  // Get graph edges at that time
  let edges = []
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    edges = gdb.prepare(`
      SELECT source, target, relation_type, confidence FROM edges
      WHERE created_at <= ? ORDER BY confidence DESC LIMIT 20
    `).all(cutoff)
    gdb.close()
  } catch(e) {}

  // Find milestones (commits near critical discoveries)
  const milestones = db.prepare(`
    SELECT key, content, commit_hash, created_at FROM semantic
    WHERE commit_hash IS NOT NULL AND key != '_schema_version'
    AND created_at <= ?
    ORDER BY created_at DESC LIMIT 8
  `).all(cutoff)

  db.close()

  return {
    journey_to: cutoff,
    topic: topic || '(全部)',
    memory_count: mems.length,
    open_issues: issues.length,
    edge_count: edges.length,
    memories: mems.slice(0, 15),
    issues,
    edges: edges.slice(0, 10),
    milestones
  }
}

function formatTimeline(journey) {
  if (!journey) return ''
  return `\n## ⏳ 时间旅行: ${journey.journey_to}\n\n` +
    `回到 ${journey.journey_to}，找到 ${journey.memory_count} 条记忆、${journey.open_issues} 个打开的问题、${journey.edge_count} 条图谱关系。\n\n` +
    (journey.milestones.length ? `### 📍 里程碑\n${journey.milestones.map(m => `- [${m.created_at}] ${m.key} @${m.commit_hash}: ${m.content?.substring(0, 100)}`).join('\n')}\n\n` : '') +
    (journey.issues.length ? `### 🔴 当时未解决\n${journey.issues.map(i => `- ${i.key}: ${i.content?.substring(0, 120)}`).join('\n')}\n\n` : '') +
    (journey.edges.length ? `### 🔗 当时的图谱\n${journey.edges.slice(0,5).map(e => `- ${e.source} —[${e.relation_type}]→ ${e.target}`).join('\n')}\n` : '')
}

module.exports = { travel, formatTimeline }
