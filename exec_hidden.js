// execHidden — spawnSync wrapper with windowsHide, same semantics as execSync
const { spawnSync } = require('child_process')

function execHidden(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, {
    encoding: options.encoding || 'utf-8',
    windowsHide: true,
    shell: false,
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    timeout: options.timeout,
    input: options.input,
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio || 'pipe',
  })
  if (r.error) throw r.error
  if (r.status !== 0) {
    const err = new Error(`Command failed: ${cmd} ${args.join(' ')}\n${(r.stderr || '').toString()}`)
    err.status = r.status
    err.stdout = r.stdout ? r.stdout.toString() : ''
    err.stderr = r.stderr ? r.stderr.toString() : ''
    throw err
  }
  return r.stdout ? r.stdout.toString() : ''
}

module.exports = { execHidden }
