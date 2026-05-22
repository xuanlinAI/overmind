// Hell benchmark fault injector
const fs = require('fs'), path = require('path');
const { spawn, execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');

function killAI(provider, ms = 5000) {
  // Simulate AI API failure by temporarily removing the API key
  const orig = process.env.OVERMIND_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  process.env.OVERMIND_API_KEY = '';
  process.env.DEEPSEEK_API_KEY = '';
  process.env.ANTHROPIC_AUTH_TOKEN = '';
  if (ms > 0) setTimeout(() => {
    process.env.OVERMIND_API_KEY = orig;
  }, ms);
  return { injected: true, duration: ms };
}

function fillDisk(targetPercent = 90) {
  // Create temp files to fill disk
  const tmpDir = path.join(ROOT, '.benchmark_diskfill');
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    for (let i = 0; i < 50; i++) {
      const buf = Buffer.alloc(1024 * 1024, 'X'); // 1MB blocks
      fs.writeFileSync(path.join(tmpDir, `fill_${i}.bin`), buf);
    }
  } catch (e) { /* disk full */ }
  return { dir: tmpDir };
}

function releaseDisk() {
  const tmpDir = path.join(ROOT, '.benchmark_diskfill');
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { }
}

function crashLayer(layer) {
  // Simulate layer crash by renaming DB files temporarily
  if (layer === 'memory') {
    const db = path.join(ROOT, 'memory.db');
    if (fs.existsSync(db)) fs.renameSync(db, db + '.crash_tmp');
    setTimeout(() => {
      if (fs.existsSync(db + '.crash_tmp')) fs.renameSync(db + '.crash_tmp', db);
    }, 3000);
  }
  if (layer === 'graph') {
    const gdb = path.join(ROOT, 'graph.db');
    if (fs.existsSync(gdb)) fs.renameSync(gdb, gdb + '.crash_tmp');
    setTimeout(() => {
      if (fs.existsSync(gdb + '.crash_tmp')) fs.renameSync(gdb + '.crash_tmp', gdb);
    }, 3000);
  }
  return { layer };
}

function killDaemon() {
  try { execSync('taskkill /f /im pythonw.exe 2>nul', { stdio: 'ignore' }); } catch (e) { }
  try { execSync('pkill -f daemon.py', { stdio: 'ignore' }); } catch (e) { }
}

function startDaemon() {
  const child = spawn('pythonw', [path.join(ROOT, 'daemon.py')], { detached: true, windowsHide: true, stdio: 'ignore', cwd: ROOT });
  child.unref();
}

function daemonAlive() {
  try {
    const r = execSync('tasklist /fi "imagename eq pythonw.exe" /fo csv /nh', { encoding: 'utf-8', timeout: 3000 });
    return r.includes('pythonw');
  } catch (e) { return false; }
}

function random() {
  const fns = [killAI, fillDisk, crashLayer, killDaemon];
  const fn = fns[Math.floor(Math.random() * fns.length)];
  const args = ['memory', 'graph'][Math.floor(Math.random() * 2)];
  return fn(args);
}

module.exports = { killAI, fillDisk, releaseDisk, crashLayer, killDaemon, startDaemon, daemonAlive, random };
