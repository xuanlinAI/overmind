const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__filename)

// Estimate token costs from Worker and Injector logs
function analyze(logDirs) {
  const estimates = {
    worker_extractions: 0,
    worker_relations: 0,
    worker_skill_prefs: 0,
    inject_skill_select: 0,
    inject_memory_select: 0,
    inject_decompose: 0,
    consolidate_apis: 0,
    total_tokens: 0,
    estimated_cost: 0
  }

  // Parse inject.log
  try {
    const injLog = path.join(ROOT, 'inject.log')
    if (fs.existsSync(injLog)) {
      const content = fs.readFileSync(injLog, 'utf-8')
      // Count API calls
      const skillCalls = (content.match(/selectSkillsAI: calling flash API/g) || []).length
      const memCalls = (content.match(/selectMemoriesAI: picked/g) || []).length
      estimates.inject_skill_select = skillCalls * 25000  // ~25K chars per call
      estimates.inject_memory_select = memCalls * 4000     // ~4K chars per call
      estimates.inject_decompose = memCalls * 2000         // ~2K chars per call
    }
  } catch(e) {}

  // Parse worker.log
  try {
    const wLog = path.join(ROOT, 'worker.log')
    if (fs.existsSync(wLog)) {
      const content = fs.readFileSync(wLog, 'utf-8')
      const extractions = (content.match(/incremental:/g) || []).length
      const relations = (content.match(/graph: extracted/g) || []).length
      const prefs = (content.match(/skill_prefs: /g) || []).length
      estimates.worker_extractions = extractions * 15000   // ~15K chars per extraction
      estimates.worker_relations = relations * 4000        // ~4K chars per relation
      estimates.worker_skill_prefs = prefs * 4000          // ~4K chars per pref check
    }
  } catch(e) {}

  estimates.total_tokens = Object.values(estimates).reduce((s, v) => s + v, 0)
  // DeepSeek pricing: ~$0.07/1M tokens (flash)
  estimates.estimated_cost = (estimates.total_tokens / 1000000) * 0.07

  // Suggestions
  const suggestions = []
  const injLog = path.join(ROOT, 'inject.log')
  if (fs.existsSync(injLog)) {
    const content = fs.readFileSync(injLog, 'utf-8')
    const timeouts = (content.match(/timeout/g) || []).length
    if (timeouts > 5) {
      suggestions.push({
        issue: 'API 超时频繁',
        fix: '增加超时时间或降低 MIN_NEW_LINES',
        saving: `约浪费 ${timeouts} 次调用`
      })
    }
  }

  return {
    estimates,
    suggestions,
    summary: `预估总 token: ${(estimates.total_tokens/1000).toFixed(0)}K, 费用: $${estimates.estimated_cost.toFixed(2)}`,
    tip: estimates.total_tokens > 500000
      ? '💡 建议: 将 MIN_NEW_LINES 从 25 提到 50，可减少 ~30% Worker API 调用'
      : ''
  }
}

function formatReport(opt) {
  if (!opt) return ''
  return '\n## 💰 成本分析\n\n' +
    `累计预估: ${opt.summary}\n` +
    (opt.tip ? `\n${opt.tip}\n` : '') +
    (opt.suggestions.length ? '\n### 优化建议\n' + opt.suggestions.map(s =>
      `- ${s.issue}: ${s.fix} (${s.saving})`).join('\n') : '') + '\n'
}

module.exports = { analyze, formatReport }
