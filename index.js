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
  try { db.exec('ALTER TABLE semantic ADD COLUMN source_session TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE semantic ADD COLUMN dedup_key TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE semantic ADD COLUMN confidence REAL DEFAULT 0.5') } catch(e) {}
  try { db.exec('ALTER TABLE semantic ADD COLUMN procedural_source TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE semantic ADD COLUMN effectiveness_score REAL DEFAULT 0.5') } catch(e) {}
  try { db.exec('ALTER TABLE semantic ADD COLUMN last_effective_at TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE semantic ADD COLUMN ineffective_count INTEGER DEFAULT 0') } catch(e) {}
  try { db.exec('ALTER TABLE semantic ADD COLUMN injected_count INTEGER DEFAULT 0') } catch(e) {}

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT,
      detail TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_feedback_key ON feedback_events(memory_key)') } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_events(event_type)') } catch(e) {}

  // Skill feedback tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      task_context TEXT DEFAULT '',
      session_id TEXT,
      effectiveness REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_skillfb_name ON skill_feedback(skill_name)') } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_skillfb_type ON skill_feedback(event_type)') } catch(e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_prefs (
      skill_name TEXT NOT NULL,
      task_pattern TEXT NOT NULL,
      use_count INTEGER DEFAULT 1,
      effectiveness REAL DEFAULT 0.5,
      last_used TEXT,
      UNIQUE(skill_name, task_pattern)
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

function saveSemantic(key, content, tags = '', sourceSession = null, dedupKey = null, confidence = 0.5) {
  // Dedup check: if dedupKey provided, check for existing memory with same dedup key
  if (dedupKey) {
    try {
      const dup = db.prepare('SELECT key, content, confidence, procedural_source FROM semantic WHERE dedup_key = ? LIMIT 1').get(dedupKey)
      if (dup) {
        if (dup.confidence >= confidence) return false // existing has higher confidence, skip
        // New has higher confidence — update linked procedural with new conclusion
        if (dup.procedural_source) {
          db.prepare('UPDATE procedural SET description = ?, steps = ? WHERE name = ?')
            .run(content, content, dup.procedural_source)
          try {
            db.prepare('DELETE FROM procedural_fts WHERE name = ?').run(dup.procedural_source)
            db.prepare('INSERT INTO procedural_fts(name, description, trigger_patterns) VALUES (?,?,?)')
              .run(dup.procedural_source, content, tags)
          } catch(e) {}
        }
        // Delete old semantic, save new
        db.prepare('DELETE FROM semantic WHERE key = ?').run(dup.key)
        db.prepare('DELETE FROM semantic_fts WHERE rowid = (SELECT rowid FROM semantic_fts WHERE key = ?)').run(dup.key)
      }
    } catch(e) {}
  }

  const existing = db.prepare('SELECT id FROM semantic WHERE key = ?').get(key)
  if (existing) {
    db.prepare(`UPDATE semantic SET content=?, tags=?, updated_at=datetime('now'), dedup_key=COALESCE(?, dedup_key) WHERE key=?`).run(content, tags, dedupKey, key)
    db.prepare('DELETE FROM semantic_fts WHERE rowid = (SELECT rowid FROM semantic_fts WHERE key = ?)').run(key)
    db.prepare('INSERT INTO semantic_fts(key, content, tags) VALUES (?,?,?)').run(key, content, tags)
  } else {
    try { db.prepare('INSERT INTO semantic (key, content, tags, source_session, dedup_key) VALUES (?, ?, ?, ?, ?)').run(key, content, tags, sourceSession, dedupKey) }
    catch(e) { db.prepare('INSERT INTO semantic (key, content, tags) VALUES (?, ?, ?)').run(key, content, tags) }
    db.prepare('INSERT INTO semantic_fts(key, content, tags) VALUES (?,?,?)').run(key, content, tags)
  }
  return true
}

function searchBM25(query, limit = 10) {
  if (!db) init()
  const q = query.replace(/[^\w\s一-鿿]/g, ' ').split(/\s+/).filter(w => w.length > 0).join(' OR ')
  if (!q) return []
  const results = db.prepare(`SELECT rowid as id, key, content, tags, rank FROM semantic_fts WHERE semantic_fts MATCH ? AND key != '_schema_version' ORDER BY rank LIMIT ?`).all(q, limit)
  return results.map(r => {
    const extra = db.prepare('SELECT access_count, updated_at, COALESCE(effectiveness_score,0.5) as effectiveness_score, COALESCE(injected_count,0) as injected_count, COALESCE(ineffective_count,0) as ineffective_count FROM semantic WHERE key = ?').get(r.key)
    return { ...r, ...(extra || {}) }
  })
}

function searchHybrid(query, limit = 10) {
  const bm25 = searchBM25(query, limit * 2)

  return bm25.map(r => {
    let accessBoost = 0
    try {
      const meta = db.prepare('SELECT access_count, updated_at FROM semantic WHERE id = ?').get(r.id)
      if (meta) {
        accessBoost = Math.min(meta.access_count * 0.02, 0.15)
        const daysSinceUpdate = (Date.now() - new Date(meta.updated_at + 'Z').getTime()) / 86400000
        if (daysSinceUpdate < 7) accessBoost += 0.1
      }
    } catch(e) {}
    return { ...r, combined: ((limit - Math.min(bm25.indexOf(r), limit)) / limit) + accessBoost }
  })
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
  const cjkRe = /[一-鿿㐀-䶿]/
  const rows = db.prepare('SELECT * FROM skill_index').all()

  if (!query) return db.prepare('SELECT * FROM skill_index ORDER BY installed_at DESC LIMIT ?').all(limit)

  // Separate natural words from CJK bigrams (bigrams get lower weight)
  const natural = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  // Also extract English/ASCII words from mixed CJK+English text
  const asciiWords = query.toLowerCase().match(/[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]/g) || []
  for (const aw of asciiWords) {
    if (!natural.includes(aw)) natural.push(aw)
  }
  const bigrams = []
  if (cjkRe.test(query)) {
    const noSpace = query.replace(/\s+/g, '')
    for (let i = 0; i < noSpace.length - 1; i++) {
      const bg = noSpace.substring(i, i + 2)
      // Only add bigrams containing at least one CJK char
      if (cjkRe.test(bg)) bigrams.push(bg)
    }
  }
  if (!natural.length && !bigrams.length) return db.prepare('SELECT * FROM skill_index LIMIT ?').all(limit)

  const scored = rows.map(r => {
    const name = (r.name || '').toLowerCase()
    const desc = (r.description || '').toLowerCase()
    const triggers = (r.triggers || '').toLowerCase()
    const tags = (r.matching_tags || '').toLowerCase()
    const filePath = (r.file_path || '').toLowerCase()
    const combined = name + ' ' + desc + ' ' + triggers + ' ' + tags
    let score = 0
    // Natural words (English, digits): full weight
    for (const w of natural) {
      if (name.includes(w)) score += 3
      else if (triggers.includes(w)) score += 3
      else if (desc.includes(w)) score += 1
      else if (combined.split(/\s+/).some(p => p.includes(w))) score += 0.5
    }
    // CJK bigrams: half weight to reduce false positives
    for (const bg of bigrams) {
      if (name.includes(bg)) score += 1.5
      else if (triggers.includes(bg)) score += 1.5
      else if (desc.includes(bg)) score += 0.5
      else if (combined.split(/\s+/).some(p => p.includes(bg))) score += 0.25
    }
    if (filePath.includes('context-proxy')) score *= 5.0
    return { ...r, score }
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score)

  // If no results, fall back to context-proxy skills sorted by recency
  if (scored.length === 0) {
    return rows.filter(r => (r.file_path || '').toLowerCase().includes('context-proxy'))
      .sort((a, b) => (b.installed_at || '').localeCompare(a.installed_at || ''))
      .slice(0, limit)
  }
  return scored.slice(0, limit)
}

function getAllSkills() {
  if (!db) init()
  return db.prepare('SELECT name, description, triggers, file_path FROM skill_index').all()
}

function getAllMemoryKeys() {
  if (!db) init()
  return db.prepare("SELECT key, content, tags, COALESCE(confidence,0.5) as confidence, COALESCE(effectiveness_score,0.5) as effectiveness_score, COALESCE(injected_count,0) as injected_count, COALESCE(ineffective_count,0) as ineffective_count FROM semantic WHERE key != '_schema_version'").all()
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

// ---- FEEDBACK LOOP ----

function recordFeedback(memoryKey, eventType, sessionId = '', detail = '') {
  if (!db) init()
  const valid = ['injected', 'referenced', 'helped', 'did_not_help', 'caused_confusion']
  if (!valid.includes(eventType)) return false
  try {
    db.prepare('INSERT INTO feedback_events (memory_key, event_type, session_id, detail) VALUES (?,?,?,?)')
      .run(memoryKey, eventType, sessionId, detail)
    // Update memory counters
    if (eventType === 'injected') {
      db.prepare('UPDATE semantic SET injected_count = COALESCE(injected_count, 0) + 1, last_accessed = datetime(\'now\') WHERE key = ?').run(memoryKey)
    } else if (eventType === 'helped') {
      db.prepare('UPDATE semantic SET effectiveness_score = MIN(1.0, COALESCE(effectiveness_score, 0.5) + 0.15), last_effective_at = datetime(\'now\'), confidence = MIN(1.0, COALESCE(confidence, 0.5) + 0.1) WHERE key = ?').run(memoryKey)
    } else if (eventType === 'did_not_help' || eventType === 'caused_confusion') {
      db.prepare('UPDATE semantic SET effectiveness_score = MAX(0.05, COALESCE(effectiveness_score, 0.5) - 0.2), ineffective_count = COALESCE(ineffective_count, 0) + 1, confidence = MAX(0.1, COALESCE(confidence, 0.5) - 0.1) WHERE key = ?').run(memoryKey)
    } else if (eventType === 'referenced') {
      db.prepare('UPDATE semantic SET access_count = COALESCE(access_count, 0) + 1, last_accessed = datetime(\'now\') WHERE key = ?').run(memoryKey)
    }
    return true
  } catch(e) { return false }
}

// Analyze session transcript to detect which injected memories were actually used
function detectMemoryReferences(injectedKeys, transcriptSnippet) {
  if (!injectedKeys || injectedKeys.length === 0) return []
  const refs = []
  const snippet = (transcriptSnippet || '').toLowerCase()
  for (const key of injectedKeys) {
    // Check if key or content fragments appear in conversation
    if (snippet.includes(key.toLowerCase())) {
      refs.push({ key, confidence: 0.8, reason: 'key_mentioned' })
      continue
    }
    // Check for content keywords (first 30 chars of content)
    try {
      const mem = db.prepare('SELECT content FROM semantic WHERE key = ?').get(key)
      if (mem && mem.content) {
        const words = mem.content.substring(0, 30).toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(w => w.length > 2)
        const matched = words.filter(w => snippet.includes(w))
        if (matched.length >= 2) {
          refs.push({ key, confidence: 0.5, reason: `content_match:${matched.slice(0, 3).join(',')}` })
        }
      }
    } catch(e) {}
  }
  return refs
}

// Apply effectiveness-based ranking boost to memories
function rankByEffectiveness(memories) {
  return memories.map(m => {
    const eff = (m.effectiveness_score || 0.5)
    const inj = (m.injected_count || 0)
    const neff = (m.ineffective_count || 0)
    // Bayesian-smoothed score: start at 0.5, move based on evidence
    const total = inj + neff + 1
    const smoothed = (0.5 * 1 + eff * inj + 0.1 * neff) / (total)
    const boost = smoothed * 0.3 + (inj > 0 ? 0.1 : 0)  // small boost just for being selected before
    return { ...m, feedback_score: Math.min(1.0, (m.combined || m.confidence || 0.5) + boost) }
  }).sort((a, b) => (b.feedback_score || 0) - (a.feedback_score || 0))
}

// Get feedback stats for a specific memory
function getMemoryFeedback(key) {
  if (!db) init()
  const events = db.prepare('SELECT event_type, COUNT(*) as c FROM feedback_events WHERE memory_key = ? GROUP BY event_type').all(key)
  const mem = db.prepare('SELECT injected_count, effectiveness_score, ineffective_count, last_effective_at FROM semantic WHERE key = ?').get(key)
  return {
    key,
    events: Object.fromEntries(events.map(e => [e.event_type, e.c])),
    injected_count: mem?.injected_count || 0,
    effectiveness_score: mem?.effectiveness_score || 0.5,
    ineffective_count: mem?.ineffective_count || 0,
    last_effective_at: mem?.last_effective_at || null
  }
}

// Auto-prune memories that consistently fail (ineffective_count >= 3, effectiveness < 0.2)
function pruneIneffective() {
  if (!db) init()
  const bad = db.prepare("SELECT key, content, effectiveness_score, ineffective_count FROM semantic WHERE key != '_schema_version' AND ineffective_count >= 3 AND COALESCE(effectiveness_score, 0.5) < 0.2").all()
  if (bad.length === 0) return 0
  for (const m of bad) {
    // Archive before delete
    const archiveDir = path.join(ROOT, 'memory', 'archive')
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true })
    const archiveFile = path.join(archiveDir, `ineffective_${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    const existing = []
    try { Object.assign(existing, JSON.parse(fs.readFileSync(archiveFile, 'utf-8'))) } catch(e) {}
    existing.push(m)
    fs.writeFileSync(archiveFile, JSON.stringify(existing, null, 2))
    db.prepare('DELETE FROM semantic WHERE key = ?').run(m.key)
    db.prepare('DELETE FROM semantic_fts WHERE rowid = (SELECT rowid FROM semantic_fts WHERE key = ?)').run(m.key)
    db.prepare('DELETE FROM feedback_events WHERE memory_key = ?').run(m.key)
  }
  db.prepare("INSERT INTO evolution_log (session_id, action, detail) VALUES ('system', 'prune_ineffective', ?)").run(JSON.stringify({ count: bad.length, keys: bad.map(m => m.key) }))
  return bad.length
}

// ---- SKILL FEEDBACK ----

function recordSkillFeedback(skillName, eventType, taskContext = '', sessionId = '', effectiveness = 0.5) {
  if (!db) init()
  const valid = ['injected', 'invoked', 'completed', 'failed', 'not_used']
  if (!valid.includes(eventType)) return false
  try {
    db.prepare('INSERT INTO skill_feedback (skill_name, event_type, task_context, session_id, effectiveness) VALUES (?,?,?,?,?)')
      .run(skillName, eventType, taskContext, sessionId, effectiveness)
    // Also update skill_index invoke_count
    if (eventType === 'invoked' || eventType === 'completed') {
      db.prepare("UPDATE skill_index SET invoke_count = COALESCE(invoke_count, 0) + 1, last_invoked = datetime('now') WHERE name = ?").run(skillName)
    }
    return true
  } catch(e) { return false }
}

function upsertSkillPref(skillName, taskPattern, effectiveness = 0.5) {
  if (!db) init()
  const existing = db.prepare('SELECT use_count, effectiveness FROM skill_prefs WHERE skill_name = ? AND task_pattern = ?').get(skillName, taskPattern)
  if (existing) {
    const newEff = Math.min(1.0, (existing.effectiveness * existing.use_count + effectiveness) / (existing.use_count + 1))
    db.prepare("UPDATE skill_prefs SET use_count = use_count + 1, effectiveness = ?, last_used = datetime('now') WHERE skill_name = ? AND task_pattern = ?")
      .run(newEff, skillName, taskPattern)
  } else {
    db.prepare('INSERT INTO skill_prefs (skill_name, task_pattern, use_count, effectiveness, last_used) VALUES (?,?,1,?,datetime(\'now\'))')
      .run(skillName, taskPattern, effectiveness)
  }
  return true
}

function getSkillPrefs(skillName = null) {
  if (!db) init()
  if (skillName) {
    return db.prepare('SELECT * FROM skill_prefs WHERE skill_name = ? ORDER BY use_count DESC, effectiveness DESC').all(skillName)
  }
  return db.prepare('SELECT * FROM skill_prefs ORDER BY use_count DESC, effectiveness DESC').all()
}

function getSkillRankings(limit = 20) {
  if (!db) init()
  return db.prepare(`
    SELECT skill_name,
      SUM(CASE WHEN event_type='injected' THEN 1 ELSE 0 END) as injected,
      SUM(CASE WHEN event_type='invoked' THEN 1 ELSE 0 END) as invoked,
      SUM(CASE WHEN event_type='completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN event_type='failed' THEN 1 ELSE 0 END) as failed,
      COALESCE(AVG(effectiveness), 0.5) as avg_effectiveness,
      COUNT(*) as total_events
    FROM skill_feedback GROUP BY skill_name
    ORDER BY completed DESC, injected DESC LIMIT ?
  `).all(limit)
}

// Export skill prefs as markdown for AI prompt injection
function formatSkillPrefsForAI(skillNames = null) {
  const prefs = skillNames
    ? skillNames.flatMap(n => getSkillPrefs(n))
    : getSkillPrefs()
  if (prefs.length === 0) return ''
  const top = prefs.slice(0, 20)
  return '## Skill Usage Preferences\n' + top.map(p =>
    `- ${p.skill_name}: preferred for "${p.task_pattern}" (used ${p.use_count}x, effectiveness ${(p.effectiveness*100).toFixed(0)}%)`
  ).join('\n')
}

// Sync skill prefs to shared JSON file (readable by all AIs)
function syncSkillPrefsToFile() {
  if (!db) init()
  const prefs = db.prepare('SELECT * FROM skill_prefs ORDER BY use_count DESC, effectiveness DESC').all()
  const rankings = db.prepare(`
    SELECT skill_name, SUM(CASE WHEN event_type='completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN event_type='invoked' THEN 1 ELSE 0 END) as invoked,
    SUM(CASE WHEN event_type='injected' THEN 1 ELSE 0 END) as injected
    FROM skill_feedback GROUP BY skill_name ORDER BY completed DESC
  `).all()
  const data = {
    updated_at: new Date().toISOString(),
    preferences: prefs,
    rankings: rankings.map(r => ({
      skill: r.skill_name,
      completed: r.completed,
      invoked: r.invoked,
      injected: r.injected,
      hit_rate: r.injected > 0 ? (r.invoked / r.injected * 100).toFixed(0) + '%' : 'N/A'
    }))
  }
  const filePath = path.join(ROOT, 'skill_prefs.json')
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return data
}

module.exports = {
  init, ensureMemoryDirs,
  saveSemantic, searchBM25, searchHybrid,
  saveProcedural, searchProcedural,
  saveEpisode, loadEpisode, listEpisodes,
  saveWorking, loadWorking,
  getAllSkills, getAllMemoryKeys, indexAllSkills, searchSkills,
  logEvolution, detectPatterns, compactMemories, getStats,
  recordFeedback, detectMemoryReferences, rankByEffectiveness, getMemoryFeedback, pruneIneffective,
  recordSkillFeedback, upsertSkillPref, getSkillPrefs, getSkillRankings,
  formatSkillPrefsForAI, syncSkillPrefsToFile
}
