const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__filename)
const SNAPSHOT_FILE = path.join(ROOT, '.compaction_snapshot.json')

function detectCompaction(transcriptDir) {
  try {
    if (!fs.existsSync(transcriptDir)) return null
    const files = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(transcriptDir, f)).mtime, path: path.join(transcriptDir, f) }))
      .sort((a, b) => b.mtime - a.mtime)
    if (files.length === 0) return null

    const raw = fs.readFileSync(files[0].path, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)

    const compactionSignals = [
      'This session is being continued',
      'Primary Request and Intent:',
      'Summary of the conversation so far',
      'The conversation has been compacted',
    ]

    let lastCompactionIdx = -1
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      for (const signal of compactionSignals) {
        if (lines[i].includes(signal)) {
          lastCompactionIdx = i
          break
        }
      }
      if (lastCompactionIdx >= 0) break
    }

    if (lastCompactionIdx >= 0) {
      // Extract compaction summary
      let summary = ''
      for (let i = lastCompactionIdx; i < Math.min(lines.length, lastCompactionIdx + 5); i++) {
        try {
          const e = JSON.parse(lines[i])
          const msg = e.message
          if (msg && typeof msg.content === 'string') {
            summary += msg.content.substring(0, 500) + '\n'
          } else if (msg && Array.isArray(msg.content)) {
            const tb = msg.content.find(b => b.type === 'text')
            if (tb) summary += tb.text.substring(0, 500) + '\n'
          }
        } catch(e) {}
      }
      return { detected: true, summary: summary.trim().substring(0, 2000), at: new Date().toISOString() }
    }
  } catch(e) {}
  return null
}

function saveSnapshot(injectionContent, compactionInfo) {
  const snapshot = {
    saved_at: new Date().toISOString(),
    injection_state: injectionContent?.substring(0, 3000) || '',
    compaction: compactionInfo
  }
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8')
  return snapshot
}

function loadSnapshot() {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return null
    const data = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'))
    // Only use snapshots < 24h old
    const age = Date.now() - new Date(data.saved_at).getTime()
    if (age > 24 * 60 * 60 * 1000) {
      fs.unlinkSync(SNAPSHOT_FILE)
      return null
    }
    return data
  } catch(e) { return null }
}

function formatSnapshot(snap) {
  if (!snap) return ''
  let text = '\n## 💾 上下文恢复\n\n'
  if (snap.compaction && snap.compaction.detected) {
    text += '检测到上次对话被压缩。恢复关键上下文：\n\n'
  } else {
    text += '上次会话的快照：\n\n'
  }
  text += (snap.injection_state?.substring(0, 2000) || '无可用快照')
  text += '\n'
  return text
}

function clearSnapshot() {
  try { if (fs.existsSync(SNAPSHOT_FILE)) fs.unlinkSync(SNAPSHOT_FILE) } catch(e) {}
}

module.exports = { detectCompaction, saveSnapshot, loadSnapshot, formatSnapshot, clearSnapshot }
