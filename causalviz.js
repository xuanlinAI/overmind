// Causal Chain Visualization — show causal paths in injection
const path = require('path')
const ROOT = path.dirname(__filename)

function visualize(graph, memKeys, limit = 3) {
  const chains = []
  for (const key of memKeys.slice(0, limit)) {
    const chain = graph.getCausalChain(key, 2)
    if (!chain || chain.chains.length === 0) continue
    chains.push({ root: key, chain })
  }
  return chains
}

function formatCausal(chains) {
  if (!chains || chains.length === 0) return ''

  let text = '\n## 🔗 因果链\n\n'

  for (const { root, chain } of chains) {
    text += `### ${root}\n`
    const blocked = chain.chains.filter(c => c.relation === 'blocked_by')
    const causes = chain.chains.filter(c => c.relation === 'causes')
    const mitigates = chain.chains.filter(c => c.relation === 'mitigates' || c.relation === 'solves')

    if (blocked.length > 0) {
      text += `├─ ⚠️ 阻塞: ${blocked.map(c => `${c.to}(${(c.confidence*100).toFixed(0)}%)`).join(', ')}\n`
    }
    if (causes.length > 0) {
      const maxFR = Math.max(...causes.map(c => c.failure_rate || 0))
      text += `├─ 🔴 导致: ${causes.map(c => `${c.to}(失败率${(c.failure_rate*100).toFixed(0)}%)`).join(', ')}\n`
      if (maxFR > 0.5) text += `│  ⚠️ 高失败率路径，建议优先处理阻塞节点\n`
    }
    if (mitigates.length > 0) {
      text += `└─ 🟢 缓解: ${mitigates.map(c => `${c.to}`).join(', ')}\n`
    }
    text += '\n'
  }

  return text
}

module.exports = { visualize, formatCausal }
