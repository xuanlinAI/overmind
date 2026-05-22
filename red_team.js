// Red Team — adversarial twin that attacks every output before you see it
const https = require('https')
const path = require('path')
const ROOT = path.dirname(__filename)
const { getAPIConfig } = require('./config')

function callFlash(prompt) {
  return new Promise((resolve, reject) => {
    const cfg = getAPIConfig(true)
    if (!cfg || !cfg.hostname) { reject(new Error('API 未配置')); return }

    const body = cfg.bodyBuilder([{ role: 'user', content: prompt }])
    const req = https.request({ hostname: cfg.hostname, path: cfg.path, method: 'POST', headers: cfg.headers, timeout: cfg.timeout }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const obj = JSON.parse(d); if (obj.error) { reject(new Error(obj.error.message || 'API error')); return } if (cfg.format === 'openai') resolve(obj.choices?.[0]?.message?.content || ''); else { const tb = obj.content?.find(c => c.type === 'text'); resolve(tb ? tb.text : (obj.content?.[0]?.text || '')) } } catch(e) { reject(e) } }) })
    req.on('error', reject); req.write(body); req.end()
  })
}

async function attack(output, context = {}) {
  if (!output || output.length < 50) return null // too short to attack

  const userModel = context.userModel || {}
  const recurringErrors = (userModel.recurring_errors || []).slice(0, 5)
  const blindSpots = (userModel.blind_spots || []).slice(0, 3)

  const prompt = `你是敌对评审。找到以下回答的最强攻击点。

回答:
${output.substring(0, 3000)}

${context.userTask ? '用户任务: ' + context.userTask : ''}
${context.warnings ? '已知警告: ' + JSON.stringify(context.warnings) : ''}
${recurringErrors.length ? '用户常犯错误: ' + recurringErrors.map(e => e.pattern + '(' + e.count + '次)').join(', ') : ''}
${blindSpots.length ? '用户盲点: ' + blindSpots.map(b => b.topic).join(', ') : ''}

输出 JSON:
{
  "objections": [
    {"severity": "critical|high|medium|low", "claim": "攻击点", "evidence": "支持证据", "suggestion": "修复建议"}
  ],
  "overall_assessment": "safe|caution|danger",
  "strongest_objection": "单一最强的攻击"
}

无问题时返回 {"objections":[],"overall_assessment":"safe"}`

  try {
    const result = await callFlash(prompt)
    let critique = null
    try { critique = JSON.parse(result.trim()) } catch(e) {
      const m = result.match(/\{[\s\S]*\}/)
      if (m) try { critique = JSON.parse(m[0]) } catch(e2) {}
    }
    if (!critique || !critique.objections) return { objections: [], overall_assessment: 'safe', strongest_objection: null }

    // Store unresolved objections in graph for hypothesis tracking
    if (critique.objections.length > 0) {
      try {
        const graph = require(path.join(ROOT, 'graph'))
        for (const obj of critique.objections) {
          if (obj.severity === 'critical' || obj.severity === 'high') {
            graph.upsertEdge('red_team', obj.claim.substring(0, 60), 'conflicts_with', 0.7, obj.evidence?.substring(0, 100) || '', 'red_team')
          }
        }
      } catch(e) {}
    }

    return critique
  } catch(e) {
    return { objections: [], overall_assessment: 'error', strongest_objection: null, error: e.message }
  }
}

function format(critique) {
  if (!critique || !critique.objections || critique.objections.length === 0) return ''
  const sev = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }
  const objList = critique.objections.map(o => `${sev[o.severity]||''} ${o.claim}${o.suggestion ? '\n  ↳ 修复: ' + o.suggestion : ''}`).join('\n')

  return `\n## 👿 红队审查\n\n` +
    `**评估: ${critique.overall_assessment === 'safe' ? '✅ 无重大问题' : '⚠️ 发现问题'}**\n\n` +
    objList +
    (critique.strongest_objection ? `\n\n> **最强攻击:** ${critique.strongest_objection}` : '') + '\n'
}

module.exports = { attack, format }
