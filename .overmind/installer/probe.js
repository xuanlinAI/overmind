// probe.js — environment detector, all Node builtins, cross-platform
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { spawnWithTimeout } = require('./lib/timeout');
const platform = require('./lib/platform');

function detectOS() {
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    isWindows: platform.isWindows,
    isMac: platform.isMac,
    isLinux: platform.isLinux,
    isWSL: platform.isWSL,
  };
}

function detectCPU() {
  const cpus = os.cpus();
  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'unknown',
    speedMHz: cpus[0]?.speed || 0,
  };
}

function detectMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const totalGB = Math.round(total / 1e9 * 10) / 10;
  const freeGB = Math.round(free / 1e9 * 10) / 10;
  return { totalGB, freeGB, sufficient: totalGB >= 4 };
}

function detectDisk(targetPath) {
  try {
    let freeGB = 0, totalGB = 0;
    if (platform.isWindows) {
      const r = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /format:csv', {
        encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore']
      }).trim().split('\n').pop();
      const parts = r.split(',');
      totalGB = Math.round(parseInt(parts[2]) / 1e9 * 10) / 10;
      freeGB = Math.round(parseInt(parts[1]) / 1e9 * 10) / 10;
    } else {
      const r = execSync('df -k ' + (targetPath || '.'), {
        encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore']
      }).trim().split('\n').pop().split(/\s+/);
      totalGB = Math.round(parseInt(r[1]) / 1e6 * 10) / 10;
      freeGB = Math.round(parseInt(r[3]) / 1e6 * 10) / 10;
    }
    return { freeGB, totalGB, sufficient: freeGB >= 2 };
  } catch (e) {
    return { freeGB: 0, totalGB: 0, sufficient: false, error: e.message };
  }
}

async function detectNode() {
  try {
    const v = process.version;
    const major = parseInt(v.replace('v', '').split('.')[0]);
    let npmVersion = '';
    try { npmVersion = execSync('npm --version', { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { }
    return { version: v, major, npmVersion, sufficient: major >= 18 };
  } catch (e) {
    return { version: 'unknown', major: 0, npmVersion: '', sufficient: false, error: e.message };
  }
}

async function detectPython() {
  const candidates = platform.isWindows ? ['pythonw', 'python'] : ['python3', 'python'];
  for (const name of candidates) {
    try {
      const path_ = platform.findExecutable(name);
      if (!path_) continue;
      const r = execSync(`"${path_}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const version = r.replace(/Python\s+/i, '').trim();

      // Check for jieba
      let hasJieba = false;
      try { execSync(`"${path_}" -c "import jieba"`, { timeout: 5000, stdio: 'ignore' }); hasJieba = true; } catch (e) { }

      return { found: true, version, path: path_, executable: name, hasJieba, hasPythonw: name === 'pythonw' };
    } catch (e) { continue; }
  }
  return { found: false, version: '', path: '', executable: '', hasJieba: false, hasPythonw: false };
}

function detectShell() {
  const def = platform.getDefaultShell();
  const fallbacks = platform.isWindows ? ['powershell', 'cmd'] : ['bash', 'zsh', 'sh'];
  return { primary: def.name, fallbacks, path: def.path };
}

async function detectAIAgents() {
  const home = os.homedir();
  const agents = {};

  // Claude Code — check sessions + settings
  const ccSessionsDir = path.join(home, '.claude', 'sessions');
  const ccSettings = path.join(home, '.claude', 'settings.json');
  agents.claudeCode = {
    detected: fs.existsSync(ccSettings),
    sessionsDir: fs.existsSync(ccSessionsDir) ? ccSessionsDir : null,
    active: false,
    sessionCount: 0,
  };
  if (agents.claudeCode.sessionsDir) {
    try {
      const sessions = fs.readdirSync(ccSessionsDir).filter(f => f.endsWith('.json'));
      agents.claudeCode.sessionCount = sessions.length;
      for (const f of sessions) {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(ccSessionsDir, f), 'utf-8'));
          if (d.status === 'busy') { agents.claudeCode.active = true; break; }
        } catch (e) { }
      }
    } catch (e) { }
  }

  // Cursor — check process + .cursorrules
  agents.cursor = { detected: false, active: false, hasRules: false };
  try { agents.cursor.hasRules = fs.existsSync('.cursorrules'); } catch (e) { }
  if (platform.isWindows) {
    try { const r = execSync('tasklist /fi "imagename eq Cursor.exe" /fo csv /nh', { encoding: 'utf-8', timeout: 3000, stdio: 'ignore' }).trim(); if (r.includes('Cursor')) agents.cursor.detected = agents.cursor.active = true; } catch (e) { }
  } else {
    try { const r = execSync('pgrep -f Cursor || true', { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }); if (r.trim()) agents.cursor.detected = agents.cursor.active = true; } catch (e) { }
  }

  // Aider — check config file
  agents.aider = {
    detected: false,
    hasConfig: false,
    configPaths: ['.aider.conf.yml', '.aiderrc', '.aider.conf', 'aider.conf.yml'],
  };
  for (const cfg of agents.aider.configPaths) {
    if (fs.existsSync(cfg)) { agents.aider.detected = agents.aider.hasConfig = true; break; }
  }

  // Codex — check dir
  const codexDir = path.join(home, '.codex');
  agents.codex = { detected: fs.existsSync(codexDir), configDir: codexDir };

  // Gemini CLI
  const geminiDir = path.join(home, '.gemini');
  agents.gemini = { detected: fs.existsSync(geminiDir), configDir: geminiDir };

  // Windsurf
  agents.windsurf = { detected: fs.existsSync('.windsurfrules'), hasRules: fs.existsSync('.windsurfrules') };

  return agents;
}

async function probe() {
  const report = {
    ok: true,
    timestamp: new Date().toISOString(),
    sessionId: `probe_${Date.now()}`,
    os: detectOS(),
    cpu: detectCPU(),
    memory: detectMemory(),
    disk: null,
    node: null,
    python: null,
    shell: detectShell(),
    agents: null,
    blockers: [],
    warnings: [],
  };
  try { report.disk = detectDisk('.'); } catch (e) { report.disk = { sufficient: false, error: e.message }; }
  report.node = await detectNode();
  report.python = await detectPython();
  try { report.agents = await detectAIAgents(); } catch (e) { report.agents = { error: e.message }; }

  // Blockers
  if (!report.node.sufficient) report.blockers.push({ code: 'NODE_TOO_OLD', message: `Node ${report.node.version}, need >=18`, hint: '升级 Node.js 到 v18+' });
  if (!report.memory.sufficient) report.blockers.push({ code: 'LOW_MEMORY', message: `${report.memory.totalGB}GB, need >=4GB`, hint: '内存不足但仍可尝试安装' });
  if (!report.disk.sufficient) report.blockers.push({ code: 'LOW_DISK', message: `磁盘剩余 ${report.disk.freeGB}GB`, hint: '释放磁盘空间或更换安装路径' });
  if (!report.python.found) report.warnings.push({ code: 'NO_PYTHON', message: 'Python 未检测到，z2 中枢将不可用', hint: '安装 Python 3.10+ 以启用全功能' });

  report.ok = report.blockers.filter(b => b.code !== 'LOW_DISK' && b.code !== 'LOW_MEMORY').length === 0;
  return report;
}

module.exports = { probe, detectOS, detectCPU, detectMemory, detectDisk, detectNode, detectPython, detectShell, detectAIAgents };
