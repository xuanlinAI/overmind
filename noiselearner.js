// Noise Self-Learning — auto-add noise patterns from feedback failures
const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__filename)
const NOISE_FILE = path.join(ROOT, '.noise_patterns.json')

function learn(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Find memories marked did_not_help 3+ times
  const failures = db.prepare(`
    SELECT memory_key, COUNT(*) as cnt FROM feedback_events
    WHERE event_type IN ('did_not_help','caused_confusion')
    GROUP BY memory_key HAVING cnt >= 3 ORDER BY cnt DESC
  `).all()

  // Find the content patterns of these failures
  const patterns = []
  for (const f of failures.slice(0, 20)) {
    const mem = db.prepare('SELECT content FROM semantic WHERE key = ?').get(f.memory_key)
    if (!mem || !mem.content) continue

    // Extract keyword patterns (2-3 word phrases)
    const words = mem.content.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(w => w.length > 1)
    if (words.length < 4) continue

    // Take the most distinctive 3-word window
    for (let i = 0; i <= words.length - 3; i++) {
      const pattern = words.slice(i, i + 3).join(' ')
      if (pattern.length > 8 && pattern.length < 60) {
        patterns.push({ pattern, count: f.cnt, source: f.memory_key })
      }
    }
  }

  // Deduplicate patterns
  const seen = new Set()
  const unique = patterns.filter(p => {
    if (seen.has(p.pattern)) return false
    seen.add(p.pattern)
    return true
  }).slice(0, 30)

  // Merge with existing noise patterns
  let existingPatterns = []
  try {
    if (fs.existsSync(NOISE_FILE)) {
      existingPatterns = JSON.parse(fs.readFileSync(NOISE_FILE, 'utf-8'))
    }
  } catch(e) {}

  // Add new patterns
  for (const p of unique) {
    const exists = existingPatterns.find(e => e.pattern === p.pattern)
    if (exists) {
      exists.count += p.count
      exists.last_seen = new Date().toISOString()
    } else {
      existingPatterns.push({ ...p, added_at: new Date().toISOString(), last_seen: new Date().toISOString() })
    }
  }

  // Prune old patterns (>30 days)
  const cutoff = Date.now() - 30 * 86400000
  existingPatterns = existingPatterns.filter(p => new Date(p.last_seen || p.added_at).getTime() > cutoff)

  fs.writeFileSync(NOISE_FILE, JSON.stringify(existingPatterns, null, 2))
  db.close()

  return {
    learned: unique.length,
    total_patterns: existingPatterns.length,
    top: unique.slice(0, 5).map(p => p.pattern)
  }
}

function isNoise(content, patterns) {
  if (!content || !patterns || patterns.length === 0) return false
  const text = content.toLowerCase()
  for (const p of patterns) {
    if (text.includes(p.pattern.toLowerCase())) return true
  }
  return false
}

function loadPatterns() {
  try {
    if (fs.existsSync(NOISE_FILE)) return JSON.parse(fs.readFileSync(NOISE_FILE, 'utf-8'))
  } catch(e) {}
  return []
}

module.exports = { learn, isNoise, loadPatterns }
