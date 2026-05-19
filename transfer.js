const path = require('path')
const ROOT = path.dirname(__filename)

function init(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cross_project (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      pattern TEXT NOT NULL,
      insight TEXT NOT NULL,
      source_project TEXT DEFAULT '',
      confidence REAL DEFAULT 0.5,
      use_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_cp_domain ON cross_project(domain)') } catch(e) {}
}

// Detect if a fact is generalizable across projects
function isTransferable(content, key) {
  if (!content) return false
  const text = (content + ' ' + key).toLowerCase()

  // Project-specific signals — NOT transferable
  const localOnly = [
    /file.*path.*d:\//i, /d:\/claude/i, /d:\/users/i,
    /ticket\.sxhm/i, /jhsgvyt/i, /特定文件名/i,
    /transcript/i, /injection\.md/i, /worker\.log/i,
    /pid\s*\d+/i, /端口\s*\d+/i, /localhost/i,
  ]
  for (const p of localOnly) {
    if (p.test(text)) return false
  }

  // Transferable patterns — general knowledge
  const transferable = [
    /微信.*oauth/i, /wechat.*auth/i, /token.*签名/i, /token.*sign/i,
    /api.*返回.*空/i, /api.*empty/i, /超时.*不一致/i, /timeout.*mismatch/i,
    /代理.*绕过/i, /proxy.*bypass/i, /webview.*代理/i,
    /mitmproxy/i, /frida.*hook/i, /字节码/i, /bytecode/i,
    /rs.*vm/i, /虚拟机.*解释/i, /加密.*算法/i,
    /skill.*推荐/i, /记忆.*注入/i, /图谱.*扩展/i,
    /并发.*竞争/i, /锁.*超时/i, /缓存.*失效/i,
  ]
  for (const p of transferable) {
    if (p.test(text)) return true
  }

  // Heuristic: facts with general technical content (no file paths, no specific names)
  const hasFilePath = /[a-z]:[\\\/]/i.test(text)
  const hasSpecificName = /\b(jhsgvyt|sxhm|context.proxy)\b/i.test(text)
  if (!hasFilePath && !hasSpecificName && content.length > 60) return true

  return false
}

function classifyDomain(content) {
  const text = (content || '').toLowerCase()
  const domains = [
    { name: '微信开发', re: /wechat|微信|wxml|wxss|小程序/i },
    { name: 'API 开发', re: /api|rest|http|fetch|响应|返回|status/i },
    { name: '认证安全', re: /oauth|token|jwt|auth|签名|加密|sign/i },
    { name: '逆向工程', re: /逆向|reverse|hook|frida|mitm|抓包|bytcode|字节/i },
    { name: '性能优化', re: /性能|优化|超时|缓存|perf/i },
    { name: '工程实践', re: /重构|测试|部署|cicd|review/i },
  ]
  for (const d of domains) {
    if (d.re.test(text)) return d.name
  }
  return '通用'
}

// Extract transferable knowledge from all memories
function extractTransferable(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
  init(db)

  const allMems = db.prepare("SELECT key, content, tags FROM semantic WHERE key != '_schema_version' AND LENGTH(content) > 40").all()
  let added = 0

  for (const m of allMems) {
    if (!isTransferable(m.content, m.key)) continue

    const domain = classifyDomain(m.content)
    // Generate a short pattern name from the key
    const pattern = m.key.replace(/_/g, ' ').substring(0, 60)

    // Check if similar insight already exists
    const existing = db.prepare('SELECT id FROM cross_project WHERE domain = ? AND pattern = ?').get(domain, pattern)
    if (existing) {
      db.prepare('UPDATE cross_project SET use_count = use_count + 1 WHERE id = ?').run(existing.id)
      continue
    }

    db.prepare('INSERT OR IGNORE INTO cross_project (domain, pattern, insight, source_project, confidence) VALUES (?,?,?,?,?)')
      .run(domain, pattern, m.content?.substring(0, 300), ROOT, 0.6)
    added++
  }

  db.close()
  return { added, total: allMems.length }
}

// Get transferable knowledge relevant to a task
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
  return '\n## 🌐 跨项目知识\n\n从其他项目中迁移的相关知识：\n\n' +
    rows.slice(0, 5).map(r =>
      `- [${r.domain}] ${r.insight?.substring(0, 150)}` +
      `\n  来源: ${r.source_project || '未知项目'} | 使用 ${r.use_count} 次`).join('\n') +
    '\n'
}

module.exports = { init, extractTransferable, getTransferable, formatTransferable, isTransferable, classifyDomain }
