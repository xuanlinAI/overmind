const { execHidden } = require('./exec_hidden')
const fs = require('fs')
const path = require('path')

function prefetch(cwd = process.cwd(), topic = '') {
  const hints = []

  // 1. Find recently modified files matching the topic
  try {
    const recent = []
    function scan(dir, depth = 0) {
      if (depth > 2) return
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue
          const fp = path.join(dir, e.name)
          if (e.isDirectory()) { scan(fp, depth + 1); continue }
          try {
            const stat = fs.statSync(fp)
            const age = (Date.now() - stat.mtimeMs) / 3600000 // hours
            if (age < 24) recent.push({ path: fp, age_hours: Math.round(age * 10) / 10, ext: path.extname(fp) })
          } catch(e) {}
        }
      } catch(e) {}
    }
    scan(cwd, 0)
    recent.sort((a, b) => a.age_hours - b.age_hours)

    // Filter by topic relevance
    if (topic) {
      const t = topic.toLowerCase()
      const relevant = recent.filter(f => {
        const name = f.path.toLowerCase()
        for (const w of t.split(/\s+/)) {
          if (w.length > 2 && name.includes(w)) return true
        }
        return false
      })
      if (relevant.length > 0) hints.push({
        type: 'recent_files',
        header: '📂 最近修改的相关文件',
        items: relevant.slice(0, 8).map(f => `- ${f.path} (${f.age_hours}h ago)`)
      })
    } else {
      hints.push({
        type: 'recent_files',
        header: '📂 最近修改的文件',
        items: recent.slice(0, 8).map(f => `- ${f.path} (${f.age_hours}h ago)`)
      })
    }
  } catch(e) {}

  // 2. Git diff summary
  try {
    const diff = execHidden('git', ['diff', '--stat', 'HEAD'], { encoding: 'utf-8', timeout: 3000, cwd }).trim()
    if (diff) {
      hints.push({
        type: 'git_diff',
        header: '🔀 未提交的改动',
        items: [`\`\`\`\n${diff.split('\n').slice(0, 10).join('\n')}\n\`\`\``]
      })
    } else {
      const staged = execHidden('git', ['diff', '--cached', '--stat'], { encoding: 'utf-8', timeout: 3000, cwd }).trim()
      if (staged) {
        hints.push({
          type: 'git_staged',
          header: '📦 已暂存的改动',
          items: [`\`\`\`\n${staged.split('\n').slice(0, 10).join('\n')}\n\`\`\``]
        })
      }
    }
  } catch(e) {}

  // 3. Find relevant scripts in the project
  try {
    const scriptExts = ['.py', '.js', '.sh', '.ps1']
    const allFiles = []
    function findScripts(dir, depth = 0) {
      if (depth > 2) return
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue
          const fp = path.join(dir, e.name)
          if (e.isDirectory()) { findScripts(fp, depth + 1); continue }
          if (scriptExts.includes(path.extname(e.name))) {
            try {
              const stat = fs.statSync(fp)
              if (stat.size < 50000) { // < 50KB scripts only
                allFiles.push({ path: fp, ext: path.extname(e.name), mtime: stat.mtimeMs })
              }
            } catch(e) {}
          }
        }
      } catch(e) {}
    }
    findScripts(cwd, 0)
    allFiles.sort((a, b) => b.mtime - a.mtime)

    if (topic && allFiles.length > 0) {
      const t = topic.toLowerCase()
      const relevant = allFiles.filter(f => {
        const name = f.path.toLowerCase()
        for (const w of t.split(/\s+/)) {
          if (w.length > 2 && name.includes(w)) return true
        }
        return false
      })
      if (relevant.length > 0) {
        hints.push({
          type: 'relevant_scripts',
          header: '📜 相关脚本',
          items: relevant.slice(0, 5).map(f => `- ${f.path} (${f.ext})`)
        })
      }
    }
  } catch(e) {}

  return { hints, total: hints.length }
}

function formatPrefetch(pf) {
  if (!pf || pf.hints.length === 0) return ''
  return '\n## ⚡ 环境预取\n\n' +
    pf.hints.map(h => `### ${h.header}\n${h.items.join('\n')}`).join('\n\n') + '\n'
}

module.exports = { prefetch, formatPrefetch }
