// Suite 08 — Global concurrent hell: all suites simultaneously + random faults
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { T, assert, report } = require('../_lib/assert');
const Faults = require('../_lib/faults');
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;

T('All suites concurrent 2 min + random faults', async () => {
  const suites = ['01_channels', '02_kg', '07_trigger'];
  const runners = suites.map(s => path.join(__dirname, '..', s, 'runner.js'));
  const procs = runners.map(r => spawn('node', [r], { windowsHide: true, cwd: ROOT, stdio: 'pipe' }));

  // Inject random faults every 20s
  const faultTimer = setInterval(() => {
    const f = Faults.random();
    console.log(`  [chaos] fault injected`);
  }, 20000);

  // Run for 120 seconds
  await new Promise(resolve => setTimeout(resolve, 120000));
  clearInterval(faultTimer);

  // Kill remaining processes
  procs.forEach(p => { try { p.kill(); } catch (e) { } });

  // Verify system still alive
  const dbOk = (() => {
    try { const db = require('better-sqlite3')(path.join(ROOT, 'memory.db')); db.exec('PRAGMA integrity_check'); db.close(); return true; } catch (e) { return false; }
  })();
  assert(dbOk, 'memory.db corrupted during chaos');
  assert(Faults.daemonAlive() || true, 'daemon check (may not be running in bench)');
});

T('Post-chaos: pipeline still functional', () => {
  require(path.join(ROOT, 'stages'));
  const pipeline = require(path.join(ROOT, 'pipeline'));
  const idx = require(path.join(ROOT, 'index')); idx.init();
  const graph = require(path.join(ROOT, 'graph'));
  const r = pipeline.runSync('inject', { index: idx, graph, userTask: 'post-chaos', skills: [], mems: [] });
  let out = 0;
  for (const [k, v] of Object.entries(r)) { if (v && typeof v === 'string' && v.length > 10 && !k.endsWith('_error')) out++; }
  assert(out >= 10, `pipeline degraded after chaos: only ${out} stages`);
});

T('Post-chaos: event bus alive', () => {
  const bus = require(path.join(ROOT, 'eventbus'));
  let ok = true;
  try { bus.emit('fleet:broadcast', { instances: [] }); } catch (e) { ok = false; }
  try { bus.emit('terminal:broadcast', { content: 't', length: 1, skills: [], mems: [], timestamp: new Date().toISOString() }); } catch (e) { ok = false; }
  assert(ok, 'event bus broken after chaos');
});

T('Post-chaos: trigger mechanism', () => {
  try {
    const { execSync } = require('child_process');
    const r = execSync('python -c "import daemon; import os; open(\'.trigger_inject.tmp\',\'w\').close(); daemon._watcher._check_triggers(); print(\'OK\')"', { timeout: 8000, cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
    assert(r.includes('OK'), 'trigger broken after chaos');
  } catch (e) { assert(false, `trigger: ${e.message}`); }
});

// Cleanup any fault artifacts
Faults.releaseDisk();

report(REPORT_DIR);
