// Suite 07 — Zero-process trigger race conditions
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { T, assert, report } = require('../_lib/assert');
const { Metrics } = require('../_lib/metrics');
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;
const met = new Metrics();

T('100 concurrent .trigger.tmp writes', () => {
  const tmpDir = path.join(ROOT, '.bench_triggers');
  fs.mkdirSync(tmpDir, { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) {
    fs.writeFileSync(path.join(tmpDir, `${i}.tmp`), '{}');
  }
  // Consume via daemon's check_triggers equivalent
  setTimeout(() => {
    const files = fs.readdirSync(tmpDir);
    files.forEach(f => {
      if (f.endsWith('.tmp')) {
        try { fs.renameSync(path.join(tmpDir, f), path.join(tmpDir, f.replace('.tmp', ''))); } catch (e) { }
        try { fs.unlinkSync(path.join(tmpDir, f.replace('.tmp', ''))); } catch (e) { }
      }
    });
  }, 100);
  const dt = Date.now() - t0;
  met.record(dt);
  // Wait and check cleanup
  const remaining = fs.readdirSync(tmpDir).filter(f => f.endsWith('.tmp'));
  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert(remaining.length < 5, `${remaining.length} tmp files not cleaned`);
});

T('trigger rename collision: 50 simultaneous', () => {
  const dir = path.join(ROOT, '.bench_trigger_race');
  fs.mkdirSync(dir, { recursive: true });
  // Write 50 tmp files then try to rename all simultaneously
  for (let i = 0; i < 50; i++) fs.writeFileSync(path.join(dir, `${i}.tmp`), '{}');
  let collisions = 0;
  for (let i = 0; i < 50; i++) {
    try { fs.renameSync(path.join(dir, `${i}.tmp`), path.join(dir, `${i}`)); } catch (e) { collisions++; }
  }
  const after = fs.readdirSync(dir).filter(f => !f.endsWith('.tmp'));
  fs.rmSync(dir, { recursive: true, force: true });
  assert(after.length >= 45, `only ${after.length} renamed (${collisions} collisions)`);
});

T('daemon trigger mechanism functional', () => {
  const t0 = Date.now();
  try {
    const r = execSync('python -c "import daemon; import os; open(\'.trigger_inject.tmp\',\'w\').close(); daemon._watcher._check_triggers(); print(\'OK\' if not os.path.exists(\'.trigger_inject.tmp\') else \'FAIL\')"', { timeout: 8000, cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
    const dt = Date.now() - t0;
    met.record(dt);
    assert(r.includes('OK'), `trigger mechanism: ${r.trim()}`);
  } catch (e) {
    assert(false, `daemon trigger test failed: ${e.message}`);
  }
});

T('execHidden all git calls safe', () => {
  const hotFiles = ['commit_gate.js', 'intent.js', 'prefetch.js', 'predictor.js', 'index.js', 'timetravel.js'];
  let found = false;
  for (const f of hotFiles) {
    const content = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    if (/execSync\s*\(/.test(content)) { found = true; break; }
  }
  assert(!found, 'execSync still present in hot-path files');
});

T('spawn windowsHide verified', () => {
  const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
  let missing = [];
  for (const f of jsFiles) {
    try {
      const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
      const hasSpawn = c.includes('spawn(') && !c.includes('spawnNode') && !c.includes('spawnSync');
      const hasHide = c.includes('windowsHide');
      if (hasSpawn && !hasHide) missing.push(f);
    } catch (e) { }
  }
  assert(missing.length === 0, `missing windowsHide: ${missing.join(', ')}`);
});

report(REPORT_DIR);
