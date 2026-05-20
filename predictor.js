// Predictive Debugging — predict failures before they happen
const { execSync } = require('child_process')
const path = require('path')
const ROOT = path.dirname(__filename)

function predict(index, graph, cwd = process.cwd()) {
  index.init()

  // 1. Get current git diff
  let diff = ''
  try {
    diff = execSync('git diff HEAD --unified=3 -- . ":(exclude)node_modules" ":(exclude).git"', {
      encoding: 'utf-8', timeout: 5000, cwd, stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch(e) { return null }

  if (!diff || diff.length < 10) return null

  // 2. Extract changed symbols from diff
  const changedFiles = []
  const changedFunctions = []
  const changedKeywords = new Set()

  const fileRe = /^\+\+\+ b\/(.+)$/gm
  let m
  while ((m = fileRe.exec(diff)) !== null) {
    changedFiles.push(m[1])
    const name = path.basename(m[1], path.extname(m[1])).toLowerCase()
    changedKeywords.add(name)
  }

  const funcRe = /^[+-]\s*(?:def|function|const|let|var|class|async|export)\s+(\w+)/gm
  while ((m = funcRe.exec(diff)) !== null) {
    changedFunctions.push(m[1])
    changedKeywords.add(m[1].toLowerCase())
  }

  if (changedFiles.length === 0) return null

  // 3. Query graph for failure patterns matching changed files/symbols
  const predictions = []
  const db = require('better-sqlite3')(path.join(ROOT, 'graph.db'))

  for (const keyword of changedKeywords) {
    if (keyword.length < 3) continue

    // Find causal edges related to this keyword
    const edges = db.prepare(`
      SELECT source, target, relation_type, confidence, evidence,
        COALESCE(failure_rate,0) as fr, COALESCE(succeed_count,0) as sc,
        COALESCE(outcome_count,0) as oc
      FROM edges WHERE (source LIKE ? OR target LIKE ? OR evidence LIKE ?)
      AND relation_type IN ('causes','blocked_by') AND COALESCE(failure_rate,0) > 0
      ORDER BY failure_rate DESC, confidence DESC LIMIT 5
    `).all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)

    for (const e of edges) {
      if (e.fr >= 0.5) {
        predictions.push({
          keyword,
          file: changedFiles[0],
          source: e.source,
          target: e.target,
          relation: e.relation_type,
          failure_rate: e.fr,
          confidence: e.confidence,
          outcomes: e.oc,
          evidence: (e.evidence || '').substring(0, 100)
        })
      }
    }
  }

  db.close()

  // 4. Score and rank
  predictions.sort((a, b) => (b.failure_rate * b.confidence) - (a.failure_rate * a.confidence))

  return {
    changed_files: changedFiles.slice(0, 10),
    changed_functions: changedFunctions.slice(0, 10),
    predictions: predictions.slice(0, 10),
    total_predictions: predictions.length,
    risk_level: predictions.length >= 5 ? 'high' : predictions.length >= 2 ? 'medium' : 'low'
  }
}

function formatPrediction(result) {
  if (!result || result.predictions.length === 0) return ''

  const riskLabel = result.risk_level === 'high' ? '🔴' : result.risk_level === 'medium' ? '🟡' : '🟢'

  return `\n## 🔮 预测调试\n\n` +
    `${riskLabel} 风险等级: **${result.risk_level}** | 改动文件: ${result.changed_files.length} | 匹配到 ${result.total_predictions} 个历史模式\n\n` +
    result.predictions.slice(0, 5).map(p =>
      `### ${p.keyword} → ${p.target}\n` +
      `- 失败率: **${(p.failure_rate*100).toFixed(0)}%** (${p.outcomes}次记录)\n` +
      `- 关系: ${p.relation} (置信度 ${(p.confidence*100).toFixed(0)}%)\n` +
      `- 证据: ${p.evidence}\n` +
      (p.failure_rate > 0.7 ? `- ⚠️ **高风险**: 这个改动曾多次导致问题，建议先检查 ${p.source}\n` : '')
    ).join('\n') +
    `\n> 基于超脑因果图谱的历史模式。预测不是定论——是用数据给你提前预警。`
}

module.exports = { predict, formatPrediction }
