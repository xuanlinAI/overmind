// Shared utilities — safe execution, logging, path resolution
const fs = require('fs')
const path = require('path')

const ROOT = path.dirname(__filename)

// Safe async run — catches, logs, returns null on failure
function safeRun(fn, name, logFile = null) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.catch(e => {
        log(`[${name}] ${e.message}`, logFile)
        return null
      })
    }
    return result
  } catch(e) {
    log(`[${name}] ${e.message}`, logFile)
    return null
  }
}

// Safe async run with full try/catch
async function safeRunAsync(fn, name, logFile = null) {
  try {
    return await fn()
  } catch(e) {
    log(`[${name}] ${e.message}`, logFile)
    return null
  }
}

// Load optional module — returns null if not found
function tryRequire(modulePath, logFile = null) {
  try {
    return require(modulePath)
  } catch(e) {
    log(`[require ${path.basename(modulePath)}] ${e.message}`, logFile)
    return null
  }
}

// Log to file
function log(msg, file) {
  const fp = file || path.join(ROOT, 'worker.log')
  try {
    fs.appendFileSync(fp, `${new Date().toISOString()} [util] ${msg}\n`)
  } catch(e) {}
}

// Auto-detect CC transcript directory
function detectTranscriptDir() {
  const home = process.env.HOME || process.env.USERPROFILE || process.env.HOME_PATH
  if (!home) return null

  const base = path.join(home, '.claude', 'projects')
  try {
    if (!fs.existsSync(base)) return null
    const dirs = fs.readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => path.join(base, d.name))
    // Return the directory with the most recent jsonl files
    let best = null, bestTime = 0
    for (const d of dirs) {
      try {
        const files = fs.readdirSync(d).filter(f => f.endsWith('.jsonl'))
        if (files.length === 0) continue
        const mtime = Math.max(...files.map(f => {
          try { return fs.statSync(path.join(d, f)).mtimeMs } catch(e) { return 0 }
        }))
        if (mtime > bestTime) { bestTime = mtime; best = d }
      } catch(e) {}
    }
    return best
  } catch(e) {
    // Fallback: try common names
    const common = ['D--claude', '.', `${require('os').hostname()}`]
    for (const name of common) {
      const p = path.join(base, name)
      if (fs.existsSync(p)) return p
    }
    return null
  }
}

module.exports = { safeRun, safeRunAsync, tryRequire, log, detectTranscriptDir, ROOT }
