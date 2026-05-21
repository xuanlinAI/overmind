// Smoke test — 6 channels + pipeline + modules + trigger
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try { fn(); passed++; results.push({ name, ok: true }); }
  catch (e) { failed++; results.push({ name, ok: false, error: e.message }); }
}

// 1. All modules load
test('62 modules load', () => {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && !f.startsWith('.'));
  const skip = new Set(['install.js','inject.js','consolidate.js','extract_worker.js','seed_v3.js']);
  for (const f of files) { if (skip.has(f)) continue; require(path.join(ROOT, f)); }
});

// 2. CH1: Pipeline
test('CH1 pipeline (17+ stages)', () => {
  require(path.join(ROOT, 'stages'));
  const p = require(path.join(ROOT, 'pipeline'));
  const idx = require(path.join(ROOT, 'index')); idx.init();
  const g = require(path.join(ROOT, 'graph'));
  const r = p.runSync('inject', { index: idx, graph: g, userTask: 'smoke', skills: [], mems: [] });
  let out = 0; for (const [k, v] of Object.entries(r)) {
    if (v && typeof v === 'string' && v.length > 10 && !k.endsWith('_error')) out++;
  }
  if (out < 10) throw new Error(`only ${out} stages output`);
});

// 3. CH3+CH4: Fleet broadcast
test('CH3 fleet_broadcast.md exists', () => {
  const fb = path.join(ROOT, '.fleet_broadcast.md');
  if (!fs.existsSync(fb)) throw new Error('missing');
  const age = Date.now() - fs.statSync(fb).mtimeMs;
  if (age > 30000) throw new Error(`stale (${Math.round(age/1000)}s old)`);
});

// 4. CH5+CH6: Terminal
test('CH5 terminal serial', () => {
  const c = require(path.join(ROOT, 'communicator'));
  const r = c.terminalSerial('# Smoke', { userTask: 'test', skills: [], mems: [] });
  if (!r || typeof r !== 'object') throw new Error('terminal return');
});

// 5. Events
test('CH6 terminal broadcast event', () => {
  const bus = require(path.join(ROOT, 'eventbus'));
  let fired = false;
  bus.on('terminal:broadcast', () => { fired = true; });
  bus.emit('terminal:broadcast', { content: 't', length: 1, skills: [], mems: [], timestamp: new Date().toISOString() });
  if (!fired) throw new Error('event not fired');
});

// 6. DB integrity
test('memory.db + graph.db integrity', () => {
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'));
  const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'));
  db.exec('PRAGMA integrity_check');
  gdb.exec('PRAGMA integrity_check');
  db.close(); gdb.close();
});

// 7. Trigger mechanism (Python)
test('trigger mechanism', () => {
  const { execSync } = require('child_process');
  const r = execSync('python -c "import daemon; import os; open(\'.trigger_inject.tmp\',\'w\').close(); daemon._watcher._check_triggers(); assert not os.path.exists(\'.trigger_inject.tmp\'); print(\'OK\')"', { timeout: 8000, cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
  if (!r.includes('OK')) throw new Error('trigger failed');
});

// 8. execHidden works
test('execHidden git', () => {
  const { execHidden } = require(path.join(ROOT, 'exec_hidden'));
  const r = execHidden('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8', timeout: 3000, cwd: ROOT });
  if (r.length < 5) throw new Error('too short: ' + r);
});

// 9. Fleet detection
test('fleet orchestrator', () => {
  const o = require(path.join(ROOT, 'orchestrator'));
  const id = o.detectInstanceId();
  const fleet = o.fleetStatus(id);
  if (!fleet || fleet.fleet_size < 1) throw new Error('no fleet');
});

// 10. No execSync residue on hot path
test('no execSync in hot-path files', () => {
  const hotFiles = ['commit_gate.js','intent.js','prefetch.js','predictor.js','index.js'];
  for (const f of hotFiles) {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    if (/execSync\s*\(/.test(c)) throw new Error(`${f} still has execSync`);
  }
});

// Report
console.log('');
console.log('═══════════════════════════');
console.log('  SMOKE TEST RESULTS');
console.log('═══════════════════════════');
results.forEach(r => console.log(r.ok ? '  ✅' : '  ❌', r.name, r.ok ? '' : '— ' + r.error));
console.log('');
console.log(`Passed: ${passed}/${passed + failed}`);
if (failed > 0) {
  console.log(`Failed: ${failed}`);
  process.exit(1);
} else {
  console.log('✅ ALL SMOKE TESTS PASSED');
}
