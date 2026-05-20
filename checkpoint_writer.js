// Checkpoint Writer — materializes recoverable snapshots
const { execSync } = require('child_process')
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)

let toolCallCount = 0
const CHECKPOINT_DIR = path.join(ROOT, '.cc-checkpoints')

function increment() { toolCallCount++ }
function shouldSnapshot() { return toolCallCount % 10 === 0 || toolCallCount === 1 }

function snapshot(index, graph, touchedFile = null) {
  if (!shouldSnapshot()) return null
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(CHECKPOINT_DIR, ts)
  fs.mkdirSync(dir, { recursive: true })

  // Snapshot touched file
  if (touchedFile && fs.existsSync(touchedFile)) {
    const dest = path.join(dir, 'files')
    fs.mkdirSync(dest, { recursive: true })
    const name = path.basename(touchedFile)
    fs.copyFileSync(touchedFile, path.join(dest, name))
  }

  // Generate restore script
  let restore = '#!/bin/bash\n# Overmind Checkpoint Restore\n'
  if (touchedFile && fs.existsSync(touchedFile)) {
    restore += `cp "${path.join(dir, 'files', path.basename(touchedFile)).replace(/\\/g, '/')}" "${touchedFile.replace(/\\/g, '/')}"\n`
  }
  fs.writeFileSync(path.join(dir, 'restore.sh'), restore)
  try { execSync(`chmod +x "${path.join(dir, 'restore.sh')}"`, { timeout: 1000 }) } catch(e) {}

  // Prune old checkpoints (>20)
  try {
    const dirs = fs.readdirSync(CHECKPOINT_DIR).filter(d => d !== '.' && d !== '..')
    if (dirs.length > 20) {
      const sorted = dirs.sort()
      for (let i = 0; i < dirs.length - 20; i++) {
        fs.rmSync(path.join(CHECKPOINT_DIR, sorted[i]), { recursive: true, force: true })
      }
    }
  } catch(e) {}

  return {
    dir, touchedFile,
    restoreCmd: `bash "${path.join(dir, 'restore.sh').replace(/\\/g, '/')}"`,
    constraint: `📦 已创建回滚点。\`${path.relative(ROOT, dir)}\` → \`bash restore.sh\` 可恢复。`
  }
}

function format(snap) {
  if (!snap) return ''
  return `\n## 📦 检查点\n\n${snap.constraint}\n`
}

module.exports = { snapshot, format, increment, shouldSnapshot }
