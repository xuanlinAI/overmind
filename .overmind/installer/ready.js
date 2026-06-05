// ready.js — smoke test + CC compatibility regression
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { spawnWithTimeout } = require('./lib/timeout');
const platform = require('./lib/platform');

const ROOT = path.resolve(__dirname, '..', '..');
const TIMEOUT = 60000;

async function testWorkerStart() {
  try {
    const r = await spawnWithTimeout('node', [path.join(ROOT, 'extract_worker.js')], { timeout: 10000, stdio: 'pipe' });
    return { ok: r.code === 0 || r.stdout.includes('watching') || r.stdout.includes('worker'), stderr: r.stderr.substring(0, 200) };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function testDaemonImport() {
  const script = `import sys; sys.path.insert(0, r'${ROOT}'); import daemon; print('OK')`;
  const tmpFile = path.join(ROOT, '.overmind', 'installer', '_probe_import.py');
  fs.writeFileSync(tmpFile, script, 'utf-8');
  try {
    const py = platform.isWindows ? (platform.findExecutable('pythonw') || platform.findExecutable('python') || 'python') : 'python3';
    const r = await spawnWithTimeout(py, [tmpFile], { timeout: 8000, stdio: 'pipe' });
    fs.unlinkSync(tmpFile);
    return { ok: r.stdout.includes('OK'), stdout: r.stdout, stderr: r.stderr.substring(0, 200) };
  } catch (e) { try { fs.unlinkSync(tmpFile); } catch (e2) { } return { ok: false, error: e.message }; }
}

async function testMCPRegistration() {
  const settingsPath = path.join(platform.isWindows ? process.env.USERPROFILE || 'C:/Users/Administrator' : os.homedir(), '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return { ok: false, reason: 'settings.json not found' };
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const hasMCP = s.mcpServers && s.mcpServers.ctxproxy;
    return { ok: !!hasMCP, registeredAs: hasMCP ? s.mcpServers.ctxproxy.command : null };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function testHookExecution() {
  let hasNull = false, logTail = '';
  const logPath = path.join(ROOT, 'hook.log');
  if (fs.existsSync(logPath)) {
    try {
      const buf = fs.readFileSync(logPath);
      for (let i = 0; i < buf.length; i++) { if (buf[i] === 0x00) { hasNull = true; break; } }
      const lines = buf.toString('utf-8').split('\n').filter(Boolean);
      logTail = lines.slice(-3).join(' | ');
    } catch (e) { logTail = e.message; }
  }
  return { ok: !hasNull, hasNullBytes: hasNull, logTail };
}

async function testCLAUDEmd() {
  const home = platform.isWindows ? (process.env.USERPROFILE || 'C:/Users/Administrator') : require('os').homedir();
  const cmPath = path.join(home, '.claude', 'CLAUDE.md');
  if (!fs.existsSync(cmPath)) return { ok: false, reason: 'CLAUDE.md not found' };
  try {
    const content = fs.readFileSync(cmPath, 'utf-8');
    const hasInclude = content.includes('injection.md') || content.includes('!include');
    return { ok: hasInclude, claudeMdPath: cmPath };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function testVBSCompat() {
  if (!platform.isWindows) return { ok: true, note: 'not windows, skip' };
  const vbsFiles = ['inject_launcher.vbs', 'consolidate_launcher.vbs', 'spawn_relay.vbs', 'launcher.vbs'];
  const results = vbsFiles.map(f => ({ name: f, exists: fs.existsSync(path.join(ROOT, f)) }));
  return { ok: results.every(r => r.exists), files: results };
}

async function testCCCompat(snapshotHandle) {
  const regressions = [];
  // Verify critical files still exist
  if (snapshotHandle && snapshotHandle.length) {
    for (const f of snapshotHandle) {
      if (!f.missing && !fs.existsSync(f.absolute || path.join(ROOT, f.path))) {
        regressions.push({ path: f.path, reason: 'deleted after install' });
      }
    }
  }
  // Verify CC exe exists
  try { execSync('claude --version', { timeout: 5000, stdio: 'ignore' }); }
  catch (e) { regressions.push({ reason: `claude --version failed: ${e.message.substring(0, 80)}` }); }
  return { ok: regressions.length === 0, regressions };
}

async function run({ timeoutMs } = {}) {
  const tests = [];
  const t0 = Date.now();
  const totalMs = timeoutMs || TIMEOUT;

  const add = async (name, fn) => {
    try {
      const r = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), totalMs))]);
      tests.push({ name, ok: r.ok !== false, detail: r });
    } catch (e) {
      tests.push({ name, ok: false, detail: { error: e.message } });
    }
  };

  await add('Daemon Import', testDaemonImport);
  await add('Worker Start', testWorkerStart);
  await add('MCP Registration', testMCPRegistration);
  await add('Hook NullBytes', testHookExecution);
  await add('CLAUDE.md', testCLAUDEmd);
  await add('VBS Compat', testVBSCompat);

  const ok = tests.every(t => t.ok);
  return {
    ok,
    passed: tests.filter(t => t.ok).map(t => t.name),
    failed: tests.filter(t => !t.ok).map(t => ({ name: t.name, reason: t.detail?.error || t.detail?.reason || 'unknown' })),
    durationMs: Date.now() - t0,
    tests,
  };
}

module.exports = { run, testWorkerStart, testDaemonImport, testMCPRegistration, testHookExecution, testCLAUDEmd, testVBSCompat, testCCCompat };
