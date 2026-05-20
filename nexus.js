// Nexus — Predictive Warmup + Fractal Pipeline + Hot Reload
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)

// === PREDICTIVE WARMUP ===
let warmupTimer = null
let lastInjectionTime = 0

function scheduleWarmup(fn, delayMs = 3000) {
  // If injections are happening rapidly, pre-warm the next cycle
  const now = Date.now()
  if (now - lastInjectionTime < 10000) {
    // High velocity — warmup makes sense
    clearTimeout(warmupTimer)
    warmupTimer = setTimeout(() => {
      try { fn() } catch(e) {}
    }, delayMs)
  }
  lastInjectionTime = now
}

// === FRACTAL PIPELINE ===
// A sub-pipeline is a named group of stages that runs like a nested pipeline
const subPipelines = new Map()

function createSubPipeline(name, stages) {
  subPipelines.set(name, stages)
}

async function runSubPipeline(name, ctx) {
  const stages = subPipelines.get(name)
  if (!stages) return {}
  const results = {}
  for (const stage of stages.sort((a,b)=>(a.priority||50)-(b.priority||50))) {
    try {
      const out = await stage.run(ctx)
      if (out) results[stage.name] = out
    } catch(e) {}
  }
  return results
}

// === HOT RELOAD ===
// Watch key modules for changes, clear require cache on update
const watched = new Map()
let watcherInterval = null

function watch(modulePath, onReload) {
  try {
    const stat = fs.statSync(modulePath)
    watched.set(modulePath, { mtime: stat.mtimeMs, callback: onReload })
  } catch(e) {}
}

function startWatcher(intervalMs = 5000) {
  if (watcherInterval) return
  watcherInterval = setInterval(() => {
    for (const [fp, info] of watched) {
      try {
        const stat = fs.statSync(fp)
        if (stat.mtimeMs > info.mtime + 500) {
          // File changed — clear cache and reload
          delete require.cache[require.resolve(fp)]
          if (info.callback) info.callback(fp)
          info.mtime = stat.mtimeMs
        }
      } catch(e) {}
    }
  }, intervalMs)
}

// Auto-watch key modules
function autoWatch() {
  const keyModules = ['persona','anomaly','optimizer','composer','verifier','forecast','communicator']
  for (const mod of keyModules) {
    const fp = path.join(ROOT, `${mod}.js`)
    if (fs.existsSync(fp)) watch(fp)
  }
  startWatcher()
}

module.exports = { scheduleWarmup, createSubPipeline, runSubPipeline, watch, startWatcher, autoWatch }
