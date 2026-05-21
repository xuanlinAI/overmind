// timeout.js — spawn with hard timeout, auto SIGKILL
const { spawn, spawnSync } = require('child_process');

function withTimeout(promise, ms, label = '') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TIMEOUT(${ms}ms): ${label}`)), ms);
    promise.then(r => { clearTimeout(timer); resolve(r); })
           .catch(e => { clearTimeout(timer); reject(e); });
  });
}

function spawnWithTimeout(cmd, args, options = {}) {
  const timeoutMs = options.timeout || 5000;
  const child = spawn(cmd, args, {
    stdio: options.stdio || 'pipe',
    windowsHide: true,
    timeout: timeoutMs,
    ...options,
  });
  let stdout = '', stderr = '';
  if (child.stdout) child.stdout.on('data', d => stdout += d);
  if (child.stderr) child.stderr.on('data', d => stderr += d);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`TIMEOUT(${timeoutMs}ms): ${cmd} ${args.join(' ')}`));
    }, timeoutMs + 500);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code: code || 0, stdout: stdout.toString(), stderr: stderr.toString() });
    });
    child.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

module.exports = { withTimeout, spawnWithTimeout };
