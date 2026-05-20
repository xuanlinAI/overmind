// Injection template — pure render, no side effects.
// All section content is pre-computed and passed via ctx.

function render(ctx) {
  const sections = ctx.sections || {}
  const skills = ctx.skills || []
  const hasSkills = skills.length > 0
  const memText = (ctx.mems || []).filter(m => !(m.key || '').startsWith('issue_')).slice(0, 5).map(m => `- ${m.key}: ${m.content?.substring(0, 200)}`).join('\n')

  function s(key) { return sections[key] || '' }

  return `# Xuanlin Overmind

## 当前任务
${ctx.userTask || '(未检测到)'}
${s('intent') ? `\n## 意图预判\n${s('intent')}` : ''}

## 项目上下文
${ctx.projCtx || ''}
${s('persona')}
${s('anticompact')}
${s('continuity')}
${s('recent')}

${ctx.taskPlan ? `\n## 执行计划\n${ctx.taskPlan}` : ''}

${ctx.warningText || ''}

${s('dream')}
${s('research')}
${s('anomaly')}
${s('cost')}
${s('composer')}
${s('verifier')}
${s('prefetch')}
${s('transfer')}
${s('timetravel')}

${hasSkills ? `## 直接执行以下指令（已注入完整内容，无需查文件）\n\n${ctx.skillText || ''}` : ''}

${ctx.issueMems?.length > 0 ? `\n## 未解决问题\n${ctx.issueMems.slice(0, 3).map(m => `- ${m.key}: ${m.content?.substring(0, 150)}`).join('\n')}` : ''}

## 相关记忆
${memText || '- 暂无相关记忆'}

## 技能注入
${ctx.skillStatus || (hasSkills ? `已注入 ${skills.length} 个技能` : '未注入技能')}

## 状态
语义${ctx.stats?.semanticCount || 0}条 技能${ctx.stats?.skillCount || 0}个 情景${ctx.stats?.episodeCount || 0}个

> 遇到技术问题先用 MCP search_memory 查记忆，再回答。`
}

module.exports = { render }
