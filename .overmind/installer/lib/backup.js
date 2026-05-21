// backup.js — .bak.{timestamp} safety net
const fs = require('fs');
const path = require('path');

function create(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = filePath + '.bak.' + ts;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function list(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(base + '.bak.'))
    .map(f => path.join(dir, f))
    .sort();
}

function restore(backupPath, targetPath) {
  if (!fs.existsSync(backupPath)) throw new Error(`backup not found: ${backupPath}`);
  fs.copyFileSync(backupPath, targetPath || backupPath.replace(/\.bak\..*$/, ''));
}

function restoreAll(backups) {
  const results = [];
  for (const b of backups) {
    const target = b.path || b.replace(/\.bak\..*$/, '');
    try { restore(b, target); results.push({ target, ok: true }); }
    catch (e) { results.push({ target, ok: false, error: e.message }); }
  }
  return results;
}

module.exports = { create, list, restore, restoreAll };
