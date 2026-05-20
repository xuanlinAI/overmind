// Counterfactual Engine — shadow timeline of decisions not taken
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)
const CF_FILE = path.join(ROOT, '.counterfactuals.json')

// Register a decision node in the graph and generate counterfactual branches
function register(decisionKey, choice, alternatives, premises, graph) {
  // Mark as decision node
  graph.upsertEdge(decisionKey, decisionKey, 'related_to', 1.0, `decision:${choice}`, 'counterfactual')

  const cf = {
    decision_key: decisionKey,
    choice,
    alternatives: alternatives || [],
    premises: premises || [], // what was assumed to be true when deciding
    created: new Date().toISOString(),
    counterfactuals: (alternatives || []).map(alt => ({
      choice: alt,
      predicted_outcome: `Choosing "${alt}" instead of "${choice}" would have led to a different trajectory.`,
      drift_checked: false
    }))
  }

  const store = read(); store.push(cf); write(store)
  return cf
}

// Check if any past decision's premises now contradict current graph state
function checkDrift(graph, index) {
  const store = read()
  const alerts = []

  for (const cf of store) {
    if (cf.drift_checked) continue
    // Check each premise against newer facts
    for (const premise of (cf.premises || [])) {
      try {
        const chain = graph.getCausalChain(cf.decision_key, 2)
        const contradictions = chain.chains.filter(c => c.relation === 'conflicts_with')
        if (contradictions.length > 0) {
          alerts.push({
            decision: cf.decision_key,
            choice: cf.choice,
            premise_violated: premise,
            evidence: contradictions[0].evidence || 'Graph contradiction detected',
            recommendation: `前提 "${premise}" 已被新证据推翻。建议重新评估决策 "${cf.choice}"。`
          })
          cf.drift_checked = true
        }
      } catch(e) {}
    }
  }

  // Check age-based drift: decisions >30 days old with no recent confirmation
  for (const cf of store) {
    const age = (Date.now() - new Date(cf.created).getTime()) / 86400000
    if (age > 30 && !cf.drift_checked && !alerts.some(a => a.decision === cf.decision_key)) {
      alerts.push({
        decision: cf.decision_key,
        choice: cf.choice,
        premise_violated: `时间漂移: 决策已 ${Math.round(age)} 天未复查`,
        recommendation: `决策 "${cf.choice}" 已过 ${Math.round(age)} 天。建议复查是否仍然适用。`
      })
      cf.drift_checked = true
    }
  }

  write(store)
  return alerts
}

function stats() { const s = read(); return { total: s.length, unchecked: s.filter(c => !c.drift_checked).length } }

function read() { try { return JSON.parse(fs.readFileSync(CF_FILE, 'utf-8')) } catch(e) { return [] } }
function write(data) { fs.writeFileSync(CF_FILE, JSON.stringify(data, null, 2)) }

function format(alerts) {
  if (!alerts || alerts.length === 0) return ''
  return '\n## 🌀 决策漂移\n\n' +
    alerts.map(a => `- **${a.decision}**: ${a.recommendation}\n  证据: ${a.premise_violated}`).join('\n') + '\n'
}

module.exports = { register, checkDrift, format, stats }
