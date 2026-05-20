// Cross-platform abstraction — spawn, paths, OS detection
const { spawn } = require('child_process')
const os = require('os')
const path = require('path')

const isWindows = os.platform() === 'win32'

function spawnNode(scriptPath, args = [], opts = {}) {
  if (isWindows) {
    return spawn('C:\\Windows\\System32\\wscript.exe',
      [path.join(path.dirname(scriptPath), 'spawn_relay.vbs'), scriptPath, ...args],
      { stdio: 'ignore', detached: true, windowsHide: true, ...opts }
    )
  }
  return spawn('node', [scriptPath, ...args], { stdio: 'ignore', detached: true, ...opts })
}

function runInBackground(fn) {
  if (isWindows) {
    const { spawn } = require('child_process')
    return spawn('node', ['-e', `(${fn.toString()})()`], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
  }
  return Promise.resolve().then(fn).catch(() => {})
}

function getWatchdogCmd() {
  if (isWindows) return 'powershell -ExecutionPolicy Bypass -File watchdog.ps1'
  return 'bash watchdog.sh'
}

function getHooksCmd(scriptPath) {
  if (isWindows) return `C:\\Windows\\System32\\wscript.exe //B //Nologo "${scriptPath}"`
  return `node "${scriptPath}"`
}

function getMCPCommand() {
  return 'python' // same on all platforms
}

module.exports = { isWindows, spawnNode, runInBackground, getWatchdogCmd, getHooksCmd, getMCPCommand }
