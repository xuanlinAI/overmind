// Deadcode — zombie memory detector (90+ days unaccessed, no auto-delete)
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)

function scan(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Find memories not accessed in 90+ days
  const zombies = db.prepare(`SELECT key, content, tags, COALESCE(confidence,0.5) as conf,
    COALESCE(last_accessed, created_at, updated_at) as last_touch,
    CAST(julianday('now') - julianday(COALESCE(last_accessed, created_at, updated_at)) AS INTEGER) as days_since_access
    FROM semantic WHERE key != '_schema_version' AND tags NOT LIKE '%deprecated%' AND tags NOT LIKE '%protected%'
    AND days_since_access > 90 ORDER BY days_since_access DESC LIMIT 50`).all()

  // Don't auto-delete — just prepare report
  const report = {
    scanned_at: new Date().toISOString(),
    total_memories: db.prepare('SELECT COUNT(*) as c FROM semantic').get().c,
    zombies: zombies.length,
    candidates: zombies.map(z => ({
      key: z.key,
      content: z.content?.substring(0, 80),
      confidence: z.conf,
      days_since_access: z.days_since_access,
      last_touch: z.last_touch?.substring(0, 19)
    }))
  }

  // Write report to file
  const reportDir = path.join(ROOT, 'reports')
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })
  const reportFile = path.join(reportDir, `purge_candidates_${new Date().toISOString().slice(0,10)}.md`)
  fs.writeFileSync(reportFile, `# Memory Purge Candidates\n\n` +
    `Found ${zombies.length} memories unaccessed for 90+ days.\n\n` +
    zombies.slice(0, 20).map(z => `- **${z.key}** (${z.days_since_access} days) — ${z.content?.substring(0,100)}`).join('\n') +
    `\n\n> No auto-deletion. Review and decide.`)

  db.close()
  return report
}

function format(report) {
  if (!report || report.zombies === 0) return ''
  return `\n## 🧟 僵尸记忆\n\n` +
    `发现 ${report.zombies} 条记忆 90+ 天未访问 (共 ${report.total_memories} 条)\n` +
    (report.candidates.slice(0, 5).map(z => `- ${z.key} (${z.days_since_access}天)`).join('\n')) +
    `\n\n> 完整报告: reports/purge_candidates_*.md | 未自动删除`
}

module.exports = { scan, format }
