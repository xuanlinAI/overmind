const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function predict(cwd = process.cwd()) {
  const signals = []

  // 1. Git branch
  try {
    const branch = execSync('git branch --show-current', { encoding:'utf-8', timeout:3000, cwd, stdio:['ignore','pipe','ignore'] }).trim()
    if (branch && branch !== 'main' && branch !== 'master') {
      signals.push({ signal: 'git_branch', value: branch, weight: 0.8 })
    }
  } catch(e) {}

  // 2. Recent files
  try {
    const files = []
    function scan(dir, depth = 0) {
      if (depth > 2) return
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue
          const fp = path.join(dir, e.name)
          if (e.isDirectory()) { scan(fp, depth + 1); continue }
          try { files.push({ path: fp, mtime: fs.statSync(fp).mtimeMs, ext: path.extname(fp) }) } catch(e) {}
        }
      } catch(e) {}
    }
    scan(cwd, 0)
    files.sort((a, b) => b.mtime - a.mtime)
    const recent = files.slice(0, 10)
    const extCount = {}
    for (const f of recent) extCount[f.ext||'unknown'] = (extCount[f.ext||'unknown']||0) + 1
    const topExt = Object.entries(extCount).sort((a,b) => b[1]-a[1])[0]
    if (topExt) signals.push({ signal: 'file_context', value: extToDomain(topExt[0]), weight: 0.5 })
  } catch(e) {}

  // 3. Time of day
  const hour = new Date().getHours()
  const timeMode = hour < 6 ? '深夜深度工作' : hour < 9 ? '清晨启动' : hour < 12 ? '上午高能' : hour < 14 ? '午后' : hour < 18 ? '下午冲刺' : hour < 22 ? '晚间' : '深夜深度工作'
  signals.push({ signal: 'time_mode', value: timeMode, weight: 0.2 })

  // 4. Project dir
  const dirName = path.basename(cwd)
  if (dirName && dirName !== '.') signals.push({ signal: 'project', value: dirName, weight: 0.4 })

  return infer(signals)
}

function extToDomain(ext) {
  const m = { '.py':'Python/脚本/逆向', '.js':'JavaScript/Node.js', '.ts':'TypeScript', '.tsx':'React前端', '.vue':'Vue前端', '.go':'Go后端', '.rs':'Rust', '.java':'Java', '.sql':'数据库', '.html':'前端', '.css':'样式', '.json':'配置', '.yaml':'部署', '.md':'文档', '.sh':'自动化' }
  return m[ext] || `${ext}开发`
}

function infer(signals) {
  if (signals.length === 0) return null
  let taskHint = '', confidence = 0

  const branch = signals.find(s => s.signal === 'git_branch')
  const file = signals.find(s => s.signal === 'file_context')
  const time = signals.find(s => s.signal === 'time_mode')

  if (branch) {
    const b = branch.value.toLowerCase()
    if (/fix|bug/.test(b)) { taskHint = '调试修复'; confidence += 0.7 }
    else if (/token|auth|login/.test(b)) { taskHint = '认证/令牌'; confidence += 0.8 }
    else if (/api|endpoint/.test(b)) { taskHint = 'API开发'; confidence += 0.6 }
    else if (/feature|feat/.test(b)) { taskHint = '新功能开发'; confidence += 0.5 }
    else if (/refactor/.test(b)) { taskHint = '代码重构'; confidence += 0.6 }
    else { taskHint = b.replace(/[-_\/]/g, ' '); confidence += 0.3 }
  }

  if (file && confidence < 0.6) { taskHint = taskHint || file.value; confidence = Math.max(confidence, 0.3) }
  if (branch && file && confidence >= 0.5) confidence = Math.min(1, confidence + 0.15)

  return {
    task_hint: taskHint || '开发任务',
    confidence: Math.round(confidence * 100) / 100,
    signals: signals.slice(0, 5).map(s => s.value),
    time_mode: time?.value || '未知',
    project: signals.find(s => s.signal === 'project')?.value || '',
    preload_hint: taskHint ? `预判: ${taskHint} (${Math.round(confidence*100)}%)` : ''
  }
}

module.exports = { predict }
