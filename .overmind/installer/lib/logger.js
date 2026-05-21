// logger.js — NULL-byte safe logging
const fs = require('fs');
const path = require('path');

let sessionId = '';
let logPath = '';

function startSession(label = 'install') {
  sessionId = `${label}_${Date.now()}`;
  logPath = path.join(__dirname, '..', '..', `.install_${sessionId}.log`);
  write(`SESSION START ${sessionId}`);
  return { sessionId, logPath };
}

function write(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  const clean = Buffer.from(line, 'utf-8').filter(b => b !== 0x00); // strip NULL bytes
  if (logPath) fs.appendFileSync(logPath, clean);
  process.stdout.write(clean);
}

function step(n, label) { write(`[${n}/6] ${label}`); }
function warn(msg) { write(`⚠ WARN: ${msg}`); }
function error(msg, detail) {
  write(`❌ ERROR: ${msg}`);
  if (detail) write(`   detail: ${JSON.stringify(detail).substring(0, 200)}`);
}
function success(msg, detail) {
  write(`✅ ${msg}`);
  if (detail) write(`   ${JSON.stringify(detail).substring(0, 200)}`);
}
function endSession() {
  write(`SESSION END ${sessionId}`);
  sessionId = '';
}

module.exports = { startSession, step, warn, error, success, endSession };
