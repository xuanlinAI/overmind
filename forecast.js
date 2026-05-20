const path = require('path')
const ROOT = path.dirname(__filename)

function predict(graph, keys) {
  if (!keys || keys.length === 0) return null
  const predictions = []

  for (const key of keys.slice(0, 5)) {
    const chain = graph.getCausalChain(key, 3)
    if (!chain || chain.chains.length === 0) continue

    const blocked = chain.chains.filter(c => c.relation === 'blocked_by')
    const risky = chain.chains.filter(c => c.relation === 'causes' && c.failure_rate >= 0.5)
    const safe = chain.chains.filter(c => c.relation === 'causes' && c.failure_rate < 0.5)
    const mitigations = chain.chains.filter(c => c.relation === 'mitigates' || c.relation === 'solves')

    if (blocked.length + risky.length === 0) continue

    // Compute predicted success rate
    let predRate = 1.0
    for (const r of risky) {
      predRate *= (1 - r.failure_rate)
    }
    for (const b of blocked) {
      predRate *= 0.3 // blocked cuts success by ~70%
    }

    predictions.push({
      key,
      blocked_by: blocked.map(b => b.to),
      risky_causes: risky.map(r => ({ effect: r.to, failure_rate: r.failure_rate, evidence: r.evidence?.substring(0, 120) })),
      safe_causes: safe.map(s => s.to),
      mitigations: mitigations.map(m => m.to),
      predicted_success: Math.round(predRate * 100),
      recommendation: buildRecommendation(blocked, risky, mitigations)
    })
  }

  return predictions.length > 0 ? { predictions, total: predictions.length } : null
}

function buildRecommendation(blocked, risky, mitigations) {
  const parts = []
  if (blocked.length > 0) {
    parts.push(`先解决阻塞: ${blocked.map(b => b.to).join(', ')}`)
  }
  if (risky.length > 0) {
    const worst = risky.sort((a, b) => b.failure_rate - a.failure_rate)[0]
    parts.push(`最高风险: ${worst.to} (失败率 ${(worst.failure_rate * 100).toFixed(0)}%)`)
  }
  if (mitigations.length > 0) {
    parts.push(`可用缓解: ${mitigations.map(m => m.to).join(', ')}`)
  }
  if (parts.length === 0) parts.push('暂无明确建议')
  return parts.join(' | ')
}

function formatForecast(forecast) {
  if (!forecast || !forecast.predictions || forecast.predictions.length === 0) return ''

  return '\n## 🔮 预测\n\n' +
    forecast.predictions.map(p =>
      `### ${p.key}\n` +
      `预计成功率: **${p.predicted_success}%**\n` +
      (p.blocked_by.length ? `- ⚠️ 阻塞: ${p.blocked_by.join(', ')}\n` : '') +
      (p.risky_causes.length ? `- 🔴 高风险因果: ${p.risky_causes.map(r => `${r.effect} (${(r.failure_rate*100).toFixed(0)}%)`).join(', ')}\n` : '') +
      `- 💡 建议: ${p.recommendation}`
    ).join('\n\n') + '\n'
}

module.exports = { predict, formatForecast }
