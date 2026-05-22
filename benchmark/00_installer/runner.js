// Suite 00 — Installer & probe/vault/config/ready stress
const fs = require('fs'), path = require('path');
const { T, assert, report } = require('../_lib/assert');
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;

// Load installer modules
const PROBE = require(path.join(ROOT, '.overmind', 'installer', 'probe'));
const VAULT = require(path.join(ROOT, '.overmind', 'installer', 'vault'));
const CONFIG = require(path.join(ROOT, '.overmind', 'installer', 'config'));
const BACKUP = require(path.join(ROOT, '.overmind', 'installer', 'lib', 'backup'));

T('probe.js detects OS/cpu/memory', async () => {
  const r = await PROBE.probe();
  assert(r.os, 'no OS info');
  assert(r.cpu.cores > 0, 'no CPU cores');
  assert(r.memory.totalGB > 0, 'no memory info');
  assert(r.ok !== undefined, 'no ok field');
});

T('probe.js detects Python', async () => {
  const py = await PROBE.detectPython();
  assert(py.found === true || py.found === false, 'python detection failed');
});

T('probe.js detects AI agents', async () => {
  const agents = await PROBE.detectAIAgents();
  assert(agents.claudeCode !== undefined, 'no claudeCode detection');
  assert(agents.cursor !== undefined, 'no cursor detection');
});

T('vault.js loads manifest with criticalFor', () => {
  const mf = VAULT.loadManifest();
  const critical = mf.entries.filter(e => e.criticalFor?.includes('claude-code'));
  assert(critical.length >= 10, `only ${critical.length} critical files, expected >=10`);
});

T('vault.js snapshot + restore cycle', async () => {
  const testFile = path.join(ROOT, '.vault_test_file');
  fs.writeFileSync(testFile, 'original');
  const snap = await VAULT.snapshot([testFile]);
  assert(snap.length === 1, 'snapshot failed');
  fs.writeFileSync(testFile, 'modified');
  await VAULT.restore(snap);
  const restored = fs.readFileSync(testFile, 'utf-8');
  assert(restored === 'original', `restore failed: got "${restored}"`);
  fs.unlinkSync(testFile);
});

T('vault.js verifyFile on known file', () => {
  const v = VAULT.verifyFile('daemon.py', '', VAULT.CATEGORIES.SYSTEM);
  assert(v.ok, `daemon.py missing or broken: ${v.reason}`);
});

T('config.js build generates valid config', async () => {
  const probe = await PROBE.probe();
  const cfg = CONFIG.build(probe);
  assert(cfg.mode, 'no mode');
  assert(cfg.features.enabled.length > 0, 'no enabled features');
  assert(cfg.params.worker.pollIntervalMs > 0, 'no worker params');
  assert(cfg.paths.root, 'no root path');
});

T('config.js writes + reads back', async () => {
  const probe = await PROBE.probe();
  const cfg = CONFIG.build(probe);
  const p = CONFIG.write(cfg, path.join(ROOT, '.benchmark_config_test.json'));
  const read = JSON.parse(fs.readFileSync(p, 'utf-8'));
  assert(read.mode === cfg.mode, 'round-trip failed');
  fs.unlinkSync(p);
});

T('backup.js create + restore', () => {
  const fp = path.join(ROOT, '.backup_test_file');
  fs.writeFileSync(fp, 'backmeup');
  const bp = BACKUP.create(fp);
  assert(bp, 'backup not created');
  assert(fs.existsSync(bp), 'backup file missing');
  fs.unlinkSync(fp);
  BACKUP.restore(bp, fp);
  assert(fs.readFileSync(fp, 'utf-8') === 'backmeup', 'restore corrupted');
  fs.unlinkSync(fp); fs.unlinkSync(bp);
});

T('10-concurrent installer probe', async () => {
  const probes = Array.from({ length: 10 }, () => PROBE.probe());
  const results = await Promise.all(probes);
  for (const r of results) assert(r.ok !== undefined, 'concurrent probe failed');
});

report(REPORT_DIR);
