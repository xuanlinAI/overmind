// Briefing — session TL;DR with ACTION focus (not narrative like episodic)
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)

function generate(sessionContext, skillFeedback, memoryFeedback) {
  // STRICT schema — no narrative, no fluff, no overlap with episodic summary
  const accomplished = []
  const blockedOn = []
  const nextAction = []

  // What skills completed? → accomplished
  if (skillFeedback) {
    const done = (skillFeedback || []).filter(f => f.event_type === 'completed')
    if (done.length) accomplished.push(`${done.length} 个技能执行成功`)
  }

  // What open issues? → blockedOn
  try { const inj = fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8')
    const re = /^- (\w+): (.+)$/gm; let m
    while ((m = re.exec(inj)) !== null) {
      if (m[1].startsWith('issue_') || m[1].includes('blocker') || m[1].includes('unresolved')) {
        blockedOn.push(`${m[2]?.substring(0,80)}`)
      }
    }
  } catch(e) {}

  // Memory feedback → what was referenced/helped
  if (memoryFeedback) {
    const helped = (memoryFeedback || []).filter(f => f.event_type === 'helped')
    if (helped.length) accomplished.push(`${helped.length} 条记忆被引用并帮助解决问题`)
  }

  // Next action from open blockers
  if (blockedOn.length) nextAction.push('优先处理上述阻塞问题')

  return {
    session_duration: 'this session',
    accomplished: accomplished.slice(0, 5),
    blocked_on: blockedOn.slice(0, 5),
    next_action: nextAction.length ? nextAction : ['继续当前方向'],
    timestamp: new Date().toISOString()
  }
}

function format(brief) {
  if (!brief) return ''
  return `\n## 📋 会话简报\n\n` +
    (brief.accomplished.length ? `**完成:** ${brief.accomplished.join(' · ')}\n` : '') +
    (brief.blocked_on.length ? `**卡点:** ${brief.blocked_on.join(' · ')}\n` : '') +
    `**下一步:** ${brief.next_action.join(' · ')}\n`
}

module.exports = { generate, format }
