// Hypothesis Tracker — verify creative syntheses over time
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)
const HYP_FILE = path.join(ROOT, '.hypotheses.json')

function register(text, sourceModules = []) {
  const store = read()
  const id = `hyp_${Date.now()}_${Math.random().toString(36).substring(2,6)}`
  store.push({ id, text, source_modules: sourceModules, status: 'pending', created: new Date().toISOString(), verified_at: null, result: null })
  write(store)
  return id
}

function verify(id, result) {
  const store = read(); const h = store.find(x => x.id === id)
  if (!h) return false
  h.status = result ? 'confirmed' : 'refuted'
  h.verified_at = new Date().toISOString()
  h.result = result
  write(store)
  return true
}

function stats() {
  const store = read()
  return { total: store.length, pending: store.filter(h=>h.status==='pending').length, confirmed: store.filter(h=>h.status==='confirmed').length, refuted: store.filter(h=>h.status==='refuted').length }
}

function read() { try { return JSON.parse(fs.readFileSync(HYP_FILE, 'utf-8')) } catch(e) { return [] } }
function write(data) { fs.writeFileSync(HYP_FILE, JSON.stringify(data, null, 2)) }

module.exports = { register, verify, stats }
