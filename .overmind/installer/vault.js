// vault.js — verify + repair + snapshot, with user/system file distinction
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const backup = require('./lib/backup');
const logger = require('./lib/logger');

const ROOT = path.resolve(__dirname, '..', '..');

const CATEGORIES = { SYSTEM: 'system', INTEGRATION: 'integration', USER: 'user', GENERATED: 'generated' };

function loadManifest() {
  const mf = path.join(__dirname, 'manifest.json');
  return JSON.parse(fs.readFileSync(mf, 'utf-8'));
}

async function snapshot(filePaths) {
  const files = [];
  for (const fp of filePaths) {
    const abs = path.isAbsolute(fp) ? fp : path.join(ROOT, fp);
    try {
      const buf = fs.readFileSync(abs);
      const stat = fs.statSync(abs);
      files.push({ path: fp, absolute: abs, content: buf, mtime: stat.mtimeMs, mode: stat.mode });
    } catch (e) { files.push({ path: fp, absolute: abs, missing: true }); }
  }
  return files;
}

async function restore(snapshotHandle) {
  const results = [];
  for (const f of (snapshotHandle.files || snapshotHandle)) {
    try {
      const target = f.absolute || path.join(ROOT, f.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content);
      results.push({ path: f.path, ok: true });
    } catch (e) { results.push({ path: f.path, ok: false, error: e.message }); }
  }
  return { restored: results.filter(r => r.ok), failed: results.filter(r => !r.ok) };
}

function verifyFile(filePath, expectedHash, category) {
  const abs = path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) return { ok: false, reason: 'missing', suggestedAction: category === CATEGORIES.SYSTEM ? 'repair' : 'warn' };
  try {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (expectedHash && actual !== expectedHash) return { ok: true, reason: 'modified', suggestedAction: category === CATEGORIES.GENERATED ? 'ignore' : 'warn' };
    return { ok: true, reason: '', suggestedAction: '' };
  } catch (e) { return { ok: false, reason: `read error: ${e.message}`, suggestedAction: 'repair' }; }
}

async function repairSystemFile(filePath, templatePath) {
  const abs = path.join(ROOT, filePath);
  const bp = backup.create(abs);
  if (templatePath) {
    const tpl = path.join(__dirname, templatePath);
    if (fs.existsSync(tpl)) { fs.copyFileSync(tpl, abs); return { ok: true, backupPath: bp }; }
  }
  // No template — create empty placeholder
  try { fs.writeFileSync(abs, ''); return { ok: true, backupPath: bp, placeholder: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function auditNullBytes(filePath) {
  const abs = path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) return { hasNull: false, offsets: [] };
  const buf = fs.readFileSync(abs);
  const offsets = [];
  for (let i = 0; i < buf.length; i++) { if (buf[i] === 0x00) offsets.push(i); }
  return { hasNull: offsets.length > 0, offsets };
}

async function validateUserFile(filePath) {
  const abs = path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) return { exists: false, parseable: false };
  try {
    const content = fs.readFileSync(abs, 'utf-8');
    try { JSON.parse(content); return { exists: true, parseable: true }; }
    catch (e) { return { exists: true, parseable: false, error: e.message }; }
  } catch (e) { return { exists: true, parseable: false, error: e.message }; }
}

async function verify({ repair, backupBeforeRepair, skipUserFiles } = {}) {
  const mf = loadManifest();
  const report = { ok: true, passed: [], fixed: [], unrecoverable: [], warnings: [] };
  for (const entry of mf.entries) {
    const abs = path.join(ROOT, entry.path);
    if (skipUserFiles && entry.category === CATEGORIES.USER) continue;
    if (entry.platforms && !entry.platforms.includes('all') && !entry.platforms.includes(process.platform)) continue;

    const v = verifyFile(entry.path, entry.sha256 || '', entry.category);
    if (v.ok && !v.reason) { report.passed.push(entry.path); continue; }

    if (entry.category === CATEGORIES.SYSTEM && repair) {
      if (backupBeforeRepair) backup.create(abs);
      const r = await repairSystemFile(entry.path, entry.templatePath);
      if (r.ok) report.fixed.push(entry.path);
      else report.unrecoverable.push({ path: entry.path, reason: r.error });
    } else if (entry.category === CATEGORIES.USER) {
      report.warnings.push({ path: entry.path, reason: v.reason, note: 'user file, skipped' });
    } else if (entry.category === CATEGORIES.GENERATED) {
      // generated files: if missing, that's fine
      report.passed.push(entry.path);
    } else {
      report.warnings.push({ path: entry.path, reason: v.reason });
    }
  }
  report.ok = report.unrecoverable.length === 0;
  return report;
}

module.exports = { loadManifest, snapshot, restore, verify, verifyFile, repairSystemFile, auditNullBytes, validateUserFile, CATEGORIES };
