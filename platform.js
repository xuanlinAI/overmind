// Cross-platform abstraction — spawn, paths, OS detection
const { spawn } = require('child_process')
const os = require('os')
const path = require('path')

const isWindows = os.platform() === 'win32'

function spawnNode(scriptPath, args = [], opts = {}) {
  const child = spawn('node', [scriptPath, ...args], { stdio: 'ignore', detached: true, windowsHide: isWindows, ...opts })
  child.on('error', () => {})
  return child
}

function runInBackground(fn) {
  if (isWindows) {
    const { spawn } = require('child_process')
    const child = spawn('node', ['-e', `(${fn.toString()})()`], { stdio: 'ignore', detached: true, windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return child
  }
  return Promise.resolve().then(fn).catch(() => {})
}

function getWatchdogCmd() {
  if (isWindows) return 'powershell -WindowStyle Hidden -File watchdog.ps1'
  return 'bash watchdog.sh'
}

function getHooksCmd(scriptPath) {
  // wscript.exe //B: GUI subsystem, VBS launcher uses Run(..., 0, False) for hidden window
  if (isWindows) return `wscript.exe //B //Nologo "${scriptPath}"`
  return `node "${scriptPath}" &`
}

function getMCPCommand() {
  return 'python' // same on all platforms
}

module.exports = { isWindows, spawnNode, runInBackground, getWatchdogCmd, getHooksCmd, getMCPCommand }
