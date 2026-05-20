// Module pipeline — unified registry + quantum caching + negative space
const stages = []
const qcache = new Map()
let lastCtxHash = null, lastCtxResults = null

function register(meta) {
  if (!meta.name || !meta.phase || !meta.run) throw new Error(`pipeline: invalid ${meta.name}`)
  const existing = stages.findIndex(s => s.name === meta.name)
  if (existing >= 0) stages[existing] = { ...meta, priority: meta.priority ?? 50, enabled: meta.enabled !== false, cacheKey: meta.cacheKey || null }
  else stages.push({ ...meta, priority: meta.priority ?? 50, enabled: meta.enabled !== false, cacheKey: meta.cacheKey || null })
}

function _hash(obj) {
  try { return require('crypto').createHash('sha256').update(JSON.stringify(obj)).digest('hex').substring(0,12) } catch(e) { return Date.now().toString() }
}

async function run(phase, ctx = {}) {
  const results = {}
  const ctxHash = _hash(ctx)
  const sorted = stages.filter(s => s.enabled && s.phase === phase).sort((a,b) => a.priority - b.priority)

  for (const stage of sorted) {
    const key = stage.name
    // Quantum cache
    if (stage.cacheKey) {
      const e = qcache.get(key)
      if (e && e.hash === ctxHash && Date.now() - e.ts < 300000) { results[key] = e.output; continue }
    }
    try {
      const out = await stage.run(ctx)
      if (out) { results[key] = out; if (stage.cacheKey) qcache.set(key, { hash: ctxHash, ts: Date.now(), output: out }) }
    } catch(e) { results[`${key}_error`] = e.message }
  }
  return results
}

function runSync(phase, ctx = {}) {
  const results = {}
  const ctxHash = _hash(ctx)

  // Negative space: ctx unchanged → reuse all results
  if (lastCtxHash === ctxHash && lastCtxResults) return lastCtxResults

  const sorted = stages.filter(s => s.enabled && s.phase === phase).sort((a,b) => a.priority - b.priority)

  for (const stage of sorted) {
    const key = stage.name
    if (stage.cacheKey) {
      const e = qcache.get(key)
      if (e && e.hash === ctxHash && Date.now() - e.ts < 300000) { results[key] = e.output; continue }
    }
    try {
      const out = stage.run(ctx)
      if (out) { results[key] = out; if (stage.cacheKey) qcache.set(key, { hash: ctxHash, ts: Date.now(), output: out }) }
    } catch(e) { results[`${key}_error`] = e.message }
  }

  // Cache full result set for negative space
  lastCtxHash = ctxHash
  lastCtxResults = results
  return results
}

function list(phase) {
  return stages.filter(s=>!phase||s.phase===phase).map(s=>({name:s.name,phase:s.phase,priority:s.priority,enabled:s.enabled,cached:!!s.cacheKey}))
}

module.exports = { register, run, runSync, list }
