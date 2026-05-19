const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function safeExec(cmd, fallback = '') {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch(e) { return fallback }
}

function predict(cwd = process.cwd()) {
  const signals = []

  // 1. Git branch
  const branch = safeExec('git branch --show-current', '', { cwd }) || safeExec('git rev-parse --abbrev-ref HEAD', '', { cwd })
  if (branch && branch !== 'main' && branch !== 'master') {
    signals.push({ signal: 'git_branch', value: branch, weight: 0.8 })
  }

  // 2. Recent commit messages (last 3)
  const commits = safeExec('git log --oneline -3 --format="%s"', '', { cwd })
  if (commits) {
    const lines = commits.split('\n').filter(Boolean)
    if (lines.length > 0) {
      signals.push({ signal: 'recent_commits', value: lines[0], weight: 0.6 })
    }
  }

  // 3. Recently modified files (top 10 by mtime)
  try {
    const files = []
    function scan(dir, depth = 0) {
      if (depth > 2) return
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          const fp = path.join(dir, entry.name)
          if (entry.isDirectory()) { scan(fp, depth + 1); continue }
          if (entry.isFile()) {
            try { files.push({ path: fp, mtime: fs.statSync(fp).mtimeMs, ext: path.extname(fp) }) }
            catch(e) {}
          }
        }
      } catch(e) {}
    }
    scan(cwd, 0)
    files.sort((a, b) => b.mtime - a.mtime)
    const recent = files.slice(0, 10)

    // Count extensions
    const extCount = {}
    for (const f of recent) {
      const ext = f.ext || 'unknown'
      extCount[ext] = (extCount[ext] || 0) + 1
    }
    const topExt = Object.entries(extCount).sort((a, b) => b[1] - a[1])[0]
    if (topExt) {
      const domain = extToDomain(topExt[0])
      signals.push({ signal: 'file_context', value: domain, weight: 0.5 })
    }

    // Most recent file
    if (recent.length > 0) {
      const latest = path.basename(recent[0].path)
      signals.push({ signal: 'last_file', value: latest, weight: 0.3 })
    }
  } catch(e) {}

  // 4. Time of day → work mode
  const hour = new Date().getHours()
  let timeMode = ''
  if (hour < 6) timeMode = '深夜深度工作'
  else if (hour < 9) timeMode = '清晨启动'
  else if (hour < 12) timeMode = '上午高能'
  else if (hour < 14) timeMode = '午后'
  else if (hour < 18) timeMode = '下午冲刺'
  else if (hour < 22) timeMode = '晚间'
  else timeMode = '深夜深度工作'
  signals.push({ signal: 'time_mode', value: timeMode, weight: 0.2 })

  // 5. Working directory context
  const dirName = path.basename(cwd)
  if (dirName && dirName !== '.') {
    signals.push({ signal: 'project', value: dirName, weight: 0.4 })
  }

  return infer(signals)
}

function extToDomain(ext) {
  const map = {
    '.py': 'Python后端/脚本/逆向',
    '.js': 'JavaScript/Node.js',
    '.ts': 'TypeScript',
    '.tsx': 'React前端',
    '.vue': 'Vue前端',
    '.go': 'Go后端',
    '.rs': 'Rust系统编程',
    '.java': 'Java',
    '.sql': '数据库',
    '.html': '前端/页面',
    '.css': '样式',
    '.json': '配置/数据',
    '.yaml': '配置/部署',
    '.md': '文档',
    '.sh': '脚本/自动化',
  }
  return map[ext] || `${ext} 相关开发`
}

function infer(signals) {
  if (signals.length === 0) return null

  // Build prediction from strongest signals
  let taskHint = ''
  let confidence = 0

  const branchSignal = signals.find(s => s.signal === 'git_branch')
  const fileSignal = signals.find(s => s.signal === 'file_context')
  const commitSignal = signals.find(s => s.signal === 'recent_commits')
  const timeSignal = signals.find(s => s.signal === 'time_mode')

  if (branchSignal) {
    const branch = branchSignal.value.toLowerCase()
    if (branch.includes('fix') || branch.includes('bug')) {
      taskHint = '调试修复'
      confidence += 0.7
    } else if (branch.includes('token') || branch.includes('auth') || branch.includes('login')) {
      taskHint = '认证/令牌相关'
      confidence += 0.8
    } else if (branch.includes('api') || branch.includes('endpoint')) {
      taskHint = 'API开发/调试'
      confidence += 0.6
    } else if (branch.includes('feature') || branch.includes('feat')) {
      taskHint = '新功能开发'
      confidence += 0.5
    } else if (branch.includes('refactor')) {
      taskHint = '代码重构'
      confidence += 0.6
    } else if (branch.includes('ui') || branch.includes('style')) {
      taskHint = 'UI/样式'
      confidence += 0.5
    } else if (branch.includes('perf') || branch.includes('optimize')) {
      taskHint = '性能优化'
      confidence += 0.6
    } else {
      taskHint = branch.replace(/[-_\/]/g, ' ')
      confidence += 0.3
    }
  }

  if (fileSignal && confidence < 0.6) {
    taskHint = taskHint || fileSignal.value
    confidence = Math.max(confidence, 0.3)
  }

  if (commitSignal && confidence < 0.5) {
    const msg = commitSignal.value.toLowerCase()
    if (msg.includes('fix') || msg.includes('bug')) taskHint = '继续修复/调试'
    else if (msg.includes('add') || msg.includes('feat')) taskHint = '继续开发'
    else if (msg.includes('refactor')) taskHint = '继续重构'
    confidence = Math.max(confidence, 0.3)
  }

  // Boost: branch + file both indicate same thing
  if (branchSignal && fileSignal && confidence >= 0.5) {
    confidence = Math.min(1.0, confidence + 0.15)
  }

  return {
    task_hint: taskHint || '开发任务',
    confidence: Math.round(confidence * 100) / 100,
    signals: signals.slice(0, 5).map(s => s.value),
    time_mode: timeSignal ? timeSignal.value : '未知',
    project: signals.find(s => s.signal === 'project')?.value || '',
    preload_hint: taskHint ? `预判任务类型: ${taskHint} (置信度 ${Math.round(confidence * 100)}%)` : ''
  }
}

module.exports = { predict }
