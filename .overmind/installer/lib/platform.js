// platform.js — cross-platform path/shell normalization
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';
const isLinux = os.platform() === 'linux';
const isWSL = isLinux && os.release().toLowerCase().includes('microsoft');

function normalizePath(p) {
  if (!p) return p;
  return isWindows ? p.replace(/\\/g, '/') : p;
}

function resolveHome(p) {
  if (!p) return p;
  const home = os.homedir();
  if (p.startsWith('~')) return path.join(home, p.slice(1));
  return p;
}

function findExecutable(name) {
  try {
    const cmd = isWindows ? `where ${name}` : `which ${name}`;
    const r = execSync(cmd, { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    return r.trim().split('\n')[0].trim();
  } catch (e) { return null; }
}

function shellQuote(arg) {
  if (isWindows) return `"${arg}"`;
  return `'${arg}'`;
}

function getDefaultShell() {
  if (isWindows) {
    const pwsh = findExecutable('powershell');
    if (pwsh) return { name: 'powershell', path: pwsh };
    return { name: 'cmd', path: 'cmd.exe' };
  }
  return { name: 'bash', path: findExecutable('bash') || '/bin/bash' };
}

module.exports = { isWindows, isMac, isLinux, isWSL, normalizePath, resolveHome, findExecutable, shellQuote, getDefaultShell };
