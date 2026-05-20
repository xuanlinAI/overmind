const path = require('path')
const ROOT = path.dirname(__filename)

function init(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS cross_project (
    id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL, pattern TEXT NOT NULL,
    insight TEXT NOT NULL, source_project TEXT DEFAULT '', confidence REAL DEFAULT 0.5,
    use_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_cp_domain ON cross_project(domain)') } catch(e) {}
}

function extractTransferable(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
  init(db)

  const mems = db.prepare("SELECT key, content, tags FROM semantic WHERE key!='_schema_version' AND LENGTH(content)>60 AND tags NOT LIKE '%deprecated%'").all()
  let added = 0

  for (const m of mems) {
    const text = (m.key + ' ' + m.content).toLowerCase()
    const hasPath = /[a-z]:[\\\/]/i.test(text) || /\bticket\.sxhm\b/i.test(text) || /\bjhsgvyt\b/i.test(text)
    if (hasPath) continue

    const domains = [
      { name:'微信开发', re:/wechat|微信|小程序|wxml/i },
      { name:'认证安全', re:/oauth|token|jwt|auth|签名|加密|sign/i },
      { name:'API开发', re:/api|rest|http|fetch|status|返回|响应/i },
      { name:'逆向工程', re:/逆向|reverse|hook|frida|mitm|字节/i },
      { name:'性能优化', re:/性能|优化|超时|缓存|perf/i },
      { name:'工程实践', re:/重构|测试|部署|review/i },
    ]
    let domain = '通用'
    for (const d of domains) { if (d.re.test(text)) { domain = d.name; break } }

    const pattern = m.key.replace(/_/g, ' ').substring(0, 60)
    db.prepare('INSERT OR IGNORE INTO cross_project (domain, pattern, insight, source_project, confidence) VALUES (?,?,?,?,?)')
      .run(domain, pattern, m.content?.substring(0, 300), ROOT, 0.6)
    added++
  }

  db.close()
  return { added, total: mems.length }
}

function getTransferable(query, limit = 8) {
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
  init(db)
  const words = (query || '').toLowerCase().split(/\s+/).filter(w => w.length > 1)
  let rows
  if (words.length > 0) {
    const likes = words.map(() => '(domain LIKE ? OR pattern LIKE ? OR insight LIKE ?)').join(' OR ')
    const params = words.flatMap(w => [`%${w}%`, `%${w}%`, `%${w}%`])
    rows = db.prepare(`SELECT * FROM cross_project WHERE ${likes} ORDER BY use_count DESC, confidence DESC LIMIT ?`).all(...params, limit)
  } else {
    rows = db.prepare('SELECT * FROM cross_project ORDER BY use_count DESC, confidence DESC LIMIT ?').all(limit)
  }
  db.close()
  return rows.slice(0, limit)
}

function formatTransferable(rows) {
  if (!rows || rows.length === 0) return ''
  return '\n## 🌐 跨项目知识\n\n' +
    rows.slice(0, 5).map(r => `- [${r.domain}] ${r.insight?.substring(0, 150)}\n  使用${r.use_count}次`).join('\n') + '\n'
}

module.exports = { init, extractTransferable, getTransferable, formatTransferable }
