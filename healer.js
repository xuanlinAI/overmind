// Self-Healing System — monitors, detects, recovers
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const ROOT = path.dirname(__filename)

function checkWorker(pidFile = path.join(ROOT, '.worker.pid')) {
  if (!fs.existsSync(pidFile)) return { ok: false, reason: 'no_pid_file' }
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'))
    try { process.kill(pid, 0); return { ok: true, pid } }
    catch(e) { return { ok: false, reason: 'process_dead', pid } }
  } catch(e) { return { ok: false, reason: 'pid_read_error' } }
}

function restartWorker() {
  try {
    const pidFile = path.join(ROOT, '.worker.pid')
    try { if (fs.existsSync(pidFile)) { const oldPid = parseInt(fs.readFileSync(pidFile, 'utf-8')); try { process.kill(oldPid, 'SIGTERM') } catch(e) {} } } catch(e) {}
    try { fs.unlinkSync(pidFile) } catch(e) {}
    require('child_process').spawn('node', [path.join(ROOT, 'extract_worker.js')], { stdio: 'ignore', detached: true }).unref()
    return true
  } catch(e) { return false }
}

function checkDB(dbPath) {
  try {
    const db = require('better-sqlite3')(dbPath, { readonly: true })
    db.prepare('SELECT 1').get()
    db.close()
    return { ok: true }
  } catch(e) {
    return { ok: false, reason: e.message }
  }
}

function repairDB(dbPath) {
  try {
    // Try WAL checkpoint
    const db = require('better-sqlite3')(dbPath)
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.pragma('optimize')
    db.close()
    return { repaired: true, method: 'checkpoint+optimize' }
  } catch(e) {
    return { repaired: false, reason: e.message }
  }
}

function checkLogHealth(logDir = ROOT) {
  const logs = {}
  for (const f of ['inject.log', 'worker.log', 'consolidate.log']) {
    const fp = path.join(logDir, f)
    if (!fs.existsSync(fp)) { logs[f] = { ok: true, lines: 0 }; continue }
    try {
      const content = fs.readFileSync(fp, 'utf-8')
      const lines = content.split('\n').filter(Boolean)
      const errors = lines.slice(-100).filter(l => /error|fail|crash/i.test(l)).length
      const lastLine = lines[lines.length - 1] || ''
      const lastTs = lastLine.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      const staleness = lastTs ? (Date.now() - new Date(lastTs[0]).getTime()) / 60000 : 999
      logs[f] = {
        ok: errors < 10 && staleness < 30,
        lines: lines.length,
        recent_errors: errors,
        stale_minutes: Math.round(staleness)
      }
    } catch(e) { logs[f] = { ok: false, reason: e.message } }
  }
  return logs
}

function runHealthCheck() {
  const results = { ts: new Date().toISOString(), checks: {}, actions: [] }

  // Check worker
  const worker = checkWorker()
  results.checks.worker = worker
  if (!worker.ok) {
    const restarted = restartWorker()
    results.actions.push({ action: 'restart_worker', result: restarted })
  }

  // Check DBs
  for (const db of ['memory.db', 'graph.db']) {
    const fp = path.join(ROOT, db)
    if (!fs.existsSync(fp)) {
      results.checks[db] = { ok: false, reason: 'missing' }
      continue
    }
    const check = checkDB(fp)
    results.checks[db] = check
    if (!check.ok) {
      const repair = repairDB(fp)
      results.actions.push({ action: `repair_${db}`, result: repair })
    }
  }

  // Check logs
  results.checks.logs = checkLogHealth()

  return results
}

// Periodic health check — call from worker loop
function start(intervalMs = 60000) {
  setInterval(() => {
    const health = runHealthCheck()
    if (health.actions.length > 0) {
      const logFile = path.join(ROOT, 'worker.log')
      try {
        fs.appendFileSync(logFile, `${new Date().toISOString()} [healer] ${health.actions.length} actions: ${JSON.stringify(health.actions)}\n`)
      } catch(e) {}
    }
  }, intervalMs)
}

module.exports = { checkWorker, restartWorker, checkDB, repairDB, checkLogHealth, runHealthCheck, start }
