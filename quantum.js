// Quantum Module State — superposition cache
// Each module hashes its inputs. If inputs unchanged from last run,
// skips computation and returns cached output. Like CPU branch prediction
// but for cognitive modules.

const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__filename)
const CACHE_FILE = path.join(ROOT, '.quantum_cache.json')

let cache = {}
try { if (fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) } catch(e) {}

function hash(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input)
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16)
}

function check(moduleId, inputHash, maxAgeMs = 300000) {
  const entry = cache[moduleId]
  if (!entry) return null
  // Cache miss: hash changed or expired
  if (entry.hash !== inputHash) return null
  if (Date.now() - entry.ts > maxAgeMs) return null
  return entry.output
}

function store(moduleId, inputHash, output) {
  cache[moduleId] = { hash: inputHash, ts: Date.now(), output }
}

function persist() {
  // Keep only last 100 entries
  const keys = Object.keys(cache)
  if (keys.length > 100) {
    const sorted = keys.sort((a, b) => cache[b].ts - cache[a].ts)
    for (const k of sorted.slice(100)) delete cache[k]
  }
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)) } catch(e) {}
}

// Wraps a module's run function with quantum caching
function wrap(moduleId, fn) {
  return (ctx) => {
    const inputHash = hash(ctx)
    const cached = check(moduleId, inputHash)
    if (cached !== null) return cached
    const output = fn(ctx)
    store(moduleId, inputHash, output)
    return output
  }
}

// Periodic cache flush
setInterval(persist, 120000)

module.exports = { check, store, wrap, hash, persist }
