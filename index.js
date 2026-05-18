const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.dirname(__filename)
const DB_PATH = path.join(ROOT, 'memory.db')

let db

function init() {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0,
      last_accessed TEXT
    )
  `)
  try { db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(key, content, tags, tokenize="unicode61")') } catch(e) {}
  try { db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS procedural_fts USING fts5(name, description, trigger_patterns, tokenize="unicode61")') } catch(e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS procedural (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      steps TEXT NOT NULL,
      trigger_patterns TEXT DEFAULT '',
      use_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_index (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      triggers TEXT DEFAULT '',
      file_path TEXT NOT NULL,
      installed_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.exec("INSERT OR IGNORE INTO semantic (key, content, tags) VALUES ('_schema_version', '1', 'system')")
  return db
}

function ensureMemoryDirs() {
  ['working', 'episodic', 'semantic', 'procedural'].forEach(d => {
    const p = path.join(ROOT, 'memory', d)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  })
}

// ---- SEMANTIC MEMORY ----

function saveSemantic(key, content, tags = '', sourceSession = null) {
  const existing = db.prepare('SELECT id FROM semantic WHERE key = ?').get(key)
  if (existing) {
    db.prepare(`UPDATE semantic SET content=?, tags=?, updated_at=datetime('now') WHERE key=?`).run(content, tags, key)
    db.prepare('DELETE FROM semantic_fts WHERE rowid = (SELECT rowid FROM semantic_fts WHERE key = ?)').run(key)
    db.prepare('INSERT INTO semantic_fts(key, content, tags) VALUES (?,?,?)').run(key, content, tags)
  } else {
    try { db.prepare('INSERT INTO semantic (key, content, tags, source_session) VALUES (?, ?, ?, ?)').run(key, content, tags, sourceSession) }
    catch(e) { db.prepare('INSERT INTO semantic (key, content, tags) VALUES (?, ?, ?)').run(key, content, tags) }
    db.prepare('INSERT INTO semantic_fts(key, content, tags) VALUES (?,?,?)').run(key, content, tags)
  }
}

function searchBM25(query, limit = 10) {
  if (!db) init()
  const q = query.replace(/[^\w\s一-鿿]/g, ' ').split(/\s+/).filter(w => w.length > 0).join(' OR ')
  if (!q) return []
  const results = db.prepare(`SELECT rowid as id, key, content, tags, rank FROM semantic_fts WHERE semantic_fts MATCH ? AND key != '_schema_version' ORDER BY rank LIMIT ?`).all(q, limit)
  return results.map(r => {
    const extra = db.prepare('SELECT access_count, updated_at FROM semantic WHERE key = ?').get(r.key)
    return { ...r, ...(extra || {}) }
  })
}

function vectorSimilarity(a, b) {
  const dot = a.reduce((s, v, i) => s + v * (b[i] || 0), 0)
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
  return magA && magB ? dot / (magA * magB) : 0
}

function textEmbedding(text) {
  const words = text.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(Boolean)
  const vec = new Array(256).fill(0)
  words.forEach(w => {
    const h = parseInt(crypto.createHash('md5').update(w).digest('hex').substring(0, 4), 16)
    vec[h % 256] += 1
  })
  const sum = vec.reduce((a, b) => a + b, 0) || 1
  return vec.map(v => v / sum)
}

function searchVector(query, limit = 10) {
  if (!db) init()
  const qVec = textEmbedding(query)
  const all = db.prepare("SELECT id, key, content, tags FROM semantic WHERE key != '_schema_version'").all()
  return all.map(row => ({
    ...row,
    score: vectorSimilarity(qVec, textEmbedding(row.content + ' ' + row.tags))
  }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function searchHybrid(query, limit = 10) {
  const bm25 = searchBM25(query, limit * 2)
  const vec = searchVector(query, limit * 2)

  const merged = {}
  bm25.forEach(r => { merged[r.id] = { ...r, bm25_rank: bm25.indexOf(r) } })
  vec.forEach(r => {
    if (merged[r.id]) merged[r.id].vec_score = r.score
    else merged[r.id] = { ...r, vec_score: r.score, bm25_rank: 999 }
  })

  return Object.values(merged)
    .map(r => ({
      ...r,
      combined: (1 - Math.min(r.bm25_rank || 999, limit) / limit) * 0.6 + (r.vec_score || 0) * 0.4
    }))
    .sort((a, b) => b.combined - a.combined)
    .slice(0, limit)
}

// ---- PROCEDURAL MEMORY ----

function saveProcedural(name, description, steps, triggers = '') {
  const existing = db.prepare('SELECT id FROM procedural WHERE name = ?').get(name)
  if (existing) {
    db.prepare('UPDATE procedural SET description=?, steps=?, trigger_patterns=? WHERE name=?')
      .run(description, steps, triggers, name)
    db.prepare('DELETE FROM procedural_fts WHERE procedural_fts MATCH ?').run(name)
    db.prepare('INSERT INTO procedural_fts(name, description, trigger_patterns) VALUES (?,?,?)').run(name, description, triggers)
  } else {
    db.prepare('INSERT INTO procedural (name, description, steps, trigger_patterns) VALUES (?,?,?,?)')
      .run(name, description, steps, triggers)
    db.prepare('INSERT INTO procedural_fts(name, description, trigger_patterns) VALUES (?,?,?)').run(name, description, triggers)
  }
}

function searchProcedural(query, limit = 5) {
  const q = query.replace(/[^\w\s一-鿿]/g, ' ').split(/\s+/).filter(w => w.length > 0).join(' OR ')
  if (!q) return []
  return db.prepare(`SELECT rowid as id, name, description, trigger_patterns, steps, rank FROM procedural_fts WHERE procedural_fts MATCH ? ORDER BY rank LIMIT ?`).all(q, limit)
}

// ---- EPISODIC ----

function saveEpisode(sessionId, content) {
  ensureMemoryDirs()
  const f = path.join(ROOT, 'memory', 'episodic', `${sessionId}.md`)
  fs.writeFileSync(f, content, 'utf-8')
}

function loadEpisode(sessionId) {
  const f = path.join(ROOT, 'memory', 'episodic', `${sessionId}.md`)
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null
}

function listEpisodes(limit = 20) {
  ensureMemoryDirs()
  return fs.readdirSync(path.join(ROOT, 'memory', 'episodic'))
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => ({
      sessionId: f.replace('.md', ''),
      file: f,
      mtime: fs.statSync(path.join(ROOT, 'memory', 'episodic', f)).mtime
    }))
}

// ---- WORKING ----

function saveWorking(sessionId, data) {
  ensureMemoryDirs()
  const f = path.join(ROOT, 'memory', 'working', `${sessionId}.json`)
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf-8')
}

function loadWorking(sessionId) {
  const f = path.join(ROOT, 'memory', 'working', `${sessionId}.json`)
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : null
}

// ---- SKILL INDEX ----

function indexAllSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) return []

  function scan(dir, depth = 0) {
    if (depth > 3) return []
    const results = []
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry)
        const stat = fs.statSync(full)
        if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          results.push(...scan(full, depth + 1))
        } else if (entry === 'SKILL.md') {
          results.push(full)
        }
      }
    } catch(e) {}
    return results
  }

  const skillFiles = scan(skillsDir)
  const skills = []

  for (const file of skillFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const fm = content.match(/^---\n([\s\S]*?)\n---/)
      if (!fm) continue
      const meta = {}
      fm[1].split('\n').forEach(line => {
        const m = line.match(/^(\w+):\s*(.+)/)
        if (m) meta[m[1]] = m[2].trim()
      })
      if (!meta.name) continue
      const desc = meta.description || ''
      const triggers = (desc.match(/TRIGGERS?:\s*(.+)/i) || [])[1] || ''

      db.prepare(`INSERT OR REPLACE INTO skill_index (name, description, triggers, file_path) VALUES (?,?,?,?)`)
        .run(meta.name, desc, triggers, file)

      skills.push({ name: meta.name, description: desc, triggers, file_path: file })
    } catch(e) {}
  }

  return skills
}

function searchSkills(query, limit = 3) {
  if (!query) return db.prepare('SELECT * FROM skill_index ORDER BY installed_at DESC LIMIT ?').all(limit)
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  if (!words.length) return db.prepare('SELECT * FROM skill_index LIMIT ?').all(limit)
  const rows = db.prepare('SELECT * FROM skill_index').all()
  return rows.map(r => {
    const name = (r.name || '').toLowerCase()
    const desc = (r.description || '').toLowerCase()
    const triggers = (r.triggers || '').toLowerCase()
    const combined = name + ' ' + desc + ' ' + triggers
    let score = 0
    for (const w of words) {
      if (name.includes(w)) score += 3
      else if (triggers.includes(w)) score += 3
      else if (desc.includes(w)) score += 1
      else if (combined.split(/\s+/).some(p => p.includes(w))) score += 0.5
    }
    return { ...r, score }
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
}

// ---- EVOLUTION ----

function logEvolution(sessionId, action, detail = '') {
  db.prepare('INSERT INTO evolution_log (session_id, action, detail) VALUES (?,?,?)')
    .run(sessionId, action, JSON.stringify(detail).substring(0, 1000))
}

function detectPatterns() {
  const frequent = db.prepare(`
    SELECT key, content, access_count FROM semantic
    WHERE access_count >= 3 AND tags NOT LIKE '%system%'
    ORDER BY access_count DESC LIMIT 10
  `).all()

  const operations = db.prepare(`
    SELECT action, COUNT(*) as cnt FROM evolution_log
    GROUP BY action HAVING cnt >= 3 ORDER BY cnt DESC
  `).all()

  return { frequentMemories: frequent, frequentOperations: operations }
}

function compactMemories() {
  const dups = db.prepare(`
    SELECT key, COUNT(*) as cnt, GROUP_CONCAT(id) as ids FROM semantic
    WHERE tags NOT LIKE '%system%'
    GROUP BY key HAVING cnt > 1
  `).all()

  for (const dup of dups) {
    const ids = dup.ids.split(',').map(Number)
    const keepId = ids[0]
    const removeIds = ids.slice(1)
    db.prepare(`UPDATE semantic SET content = (SELECT content FROM semantic WHERE id = ?), updated_at = datetime('now') WHERE id = ?`)
      .run(keepId, keepId)
    removeIds.forEach(id => {
      db.prepare('DELETE FROM semantic WHERE id = ?').run(id)
    })
    logEvolution('system', 'compact', { merged: dup.key, count: dup.cnt })
  }
}

function getStats() {
  const semanticCount = db.prepare('SELECT COUNT(*) as c FROM semantic').get().c
  const proceduralCount = db.prepare('SELECT COUNT(*) as c FROM procedural').get().c
  const skillCount = db.prepare('SELECT COUNT(*) as c FROM skill_index').get().c
  const evoCount = db.prepare('SELECT COUNT(*) as c FROM evolution_log').get().c
  const episodeCount = listEpisodes(1000).length
  return { semanticCount, proceduralCount, skillCount, evoCount, episodeCount }
}

module.exports = {
  init, ensureMemoryDirs,
  saveSemantic, searchBM25, searchVector, searchHybrid,
  saveProcedural, searchProcedural,
  saveEpisode, loadEpisode, listEpisodes,
  saveWorking, loadWorking,
  indexAllSkills, searchSkills,
  logEvolution, detectPatterns, compactMemories, getStats
}
