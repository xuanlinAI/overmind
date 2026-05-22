// Fleet Reporter — reads daemon broadcast and generates fleet summary for CH1 pipeline
const fs = require('fs')
const path = require('path')
const ROOT = path.dirname(__filename)

function report() {
  try {
    const fp = path.join(ROOT, '.fleet_broadcast.md')
    if (!fs.existsSync(fp)) return null
    const text = fs.readFileSync(fp, 'utf-8')
    const lines = text.split(/\r?\n/)

    // Read self-ID
    let selfId = ''
    try { selfId = fs.readFileSync(path.join(ROOT, '.current_instance'), 'utf-8').trim() } catch (e) {}

    const others = []; let total = 0; let selfFound = false
    for (const l of lines) {
      const m = l.match(/^###\s+(\S+)\s+\[.+?\]\s+(🟢|⚪)\s+(.+)/)
      if (m) {
        total++
        const id = m[1], status = m[2], topic = m[3].trim().substring(0, 60)
        const isSelf = selfId && selfId.startsWith(id)
        if (isSelf) selfFound = true
        if (!isSelf) others.push({ id, status, topic })
      }
    }
    const active = others.filter(o => o.status === '🟢')
    if (active.length === 0 && total <= 1) return null
    const lines_out = active.slice(0, 4).map(o => '- **' + o.id + '** 🟢 ' + o.topic)
    if (lines_out.length === 0) return null
    const selfNote = selfFound ? ' 🏠本会话未显示' : ''
    return '\n## 🌐 舰队动态\n\n' + lines_out.join('\n') + (selfNote ? '\n' + selfNote : '') + '\n'
  } catch (e) { return null }
}

module.exports = { report, summary }

function summary() {
  try {
    const fp = path.join(ROOT, '.fleet_broadcast.md')
    if (!fs.existsSync(fp)) return null
    const text = fs.readFileSync(fp, 'utf-8')
    const lines = text.split(/\r?\n/)
    let selfId = ''
    try { selfId = fs.readFileSync(path.join(ROOT, '.current_instance'), 'utf-8').trim() } catch (e) {}
    let total = 0, active = 0
    for (const l of lines) {
      if (l.startsWith('### ')) {
        total++
        if (selfId && l.includes(selfId.substring(0, 8))) continue // skip self
        if (l.includes('🟢')) active++
      }
    }
    total-- // exclude self
    if (total <= 0) return null
    return '\n## 🌐 终端舰队\n' + active + ' 个同伴在线 (共 ' + total + ' 个实例)\n'
  } catch (e) { return null }
}
