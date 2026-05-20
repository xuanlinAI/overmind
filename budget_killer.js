// Budget Killer — hard-stops runaway loops with concrete remediation
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)
const STUCK_DIR = path.join(ROOT, '.cc-stuck')

let callCounts = {} // { taskId: count }
let failureCounts = {} // { command: count }
let lastReset = Date.now()

function track(taskId, command) {
  // Reset every 5 minutes
  if (Date.now() - lastReset > 300000) { callCounts = {}; failureCounts = {}; lastReset = Date.now() }

  callCounts[taskId] = (callCounts[taskId] || 0) + 1
  if (!command) return null

  // Track command failures for retry detection
  const cmdKey = (command || '').substring(0, 50)
  failureCounts[cmdKey] = (failureCounts[cmdKey] || 0) + 1

  // Threshold 1: Same subtask > 15 tool calls
  if (callCounts[taskId] >= 15) {
    return createStuckReport(taskId, { type: 'tool_limit', count: callCounts[taskId] })
  }

  // Threshold 2: Same command retried 3+ times
  if (failureCounts[cmdKey] >= 3) {
    return createStuckReport(taskId, { type: 'retry_loop', command: cmdKey, count: failureCounts[cmdKey] })
  }

  return null
}

function createStuckReport(taskId, info) {
  if (!fs.existsSync(STUCK_DIR)) fs.mkdirSync(STUCK_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(STUCK_DIR, `stuck_${taskId}_${ts}.md`)

  const report = `# Stuck Report\n\n` +
    `**Task:** ${taskId}\n**Type:** ${info.type}\n**Count:** ${info.count}\n` +
    (info.command ? `**Command:** \`${info.command}\`\n` : '') +
    `**Time:** ${new Date().toISOString()}\n\n` +
    `## Suggested Actions\n` +
    `1. 人工检查当前状态\n2. 考虑换方案\n3. 缩小任务范围\n`

  fs.writeFileSync(file, report)

  return {
    taskId, file,
    constraint: `⛔ 触达预算上限 (${info.type === 'tool_limit' ? `${info.count}次工具调用` : `同一命令重试${info.count}次`})。已写卡点报告: ${path.basename(file)}。请审阅后决定方向。`
  }
}

function format(result) {
  if (!result) return ''
  return `\n## ⛔ 预算拦截\n\n${result.constraint}\n`
}

module.exports = { track, format }
