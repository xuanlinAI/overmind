const path = require('path')
const ROOT = path.dirname(__filename)

function analyze(index) {
  index.init()
  const findings = []

  // 1. Repeated failures: memories with high ineffective_count
  const failures = []
  try {
    const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
    const bad = db.prepare(`
      SELECT key, content, COALESCE(ineffective_count,0) as nc, COALESCE(effectiveness_score,0.5) as eff,
             COALESCE(injected_count,0) as ic
      FROM semantic WHERE key != '_schema_version'
      AND ineffective_count >= 3 AND COALESCE(effectiveness_score, 0.5) < 0.3
      ORDER BY ineffective_count DESC LIMIT 10
    `).all()

    for (const m of bad) {
      let edges = []
      try {
        const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
        edges = gdb.prepare(`
          SELECT source, target, relation_type, evidence FROM edges
          WHERE (source = ? OR target = ?) AND relation_type IN ('blocked_by','causes','depends_on')
          ORDER BY confidence DESC LIMIT 5
        `).all(m.key, m.key)
        gdb.close()
      } catch(e) {}

      failures.push({
        key: m.key,
        content: m.content?.substring(0, 200),
        ineffective_count: m.nc,
        effectiveness: m.eff,
        injected_count: m.ic,
        related_edges: edges
      })
    }
    db.close()
  } catch(e) {}

  if (failures.length > 0) {
    findings.push({
      type: 'repeated_failures',
      title: `🔴 ${failures.length} 个反复失败模式`,
      body: failures.map(f => {
        const edgeInfo = f.related_edges.length > 0
          ? `\n  关联: ${f.related_edges.map(e => `${e.source} —[${e.relation_type}]→ ${e.target}`).join(', ')}`
          : ''
        return `- ${f.key}: 注入 ${f.injected_count} 次，${f.ineffective_count} 次无效 (有效率 ${(f.effectiveness*100).toFixed(0)}%)${edgeInfo}`
      }).join('\n')
    })
  }

  // 2. Contradictions: memories with conflicts_with edges
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    const conflicts = gdb.prepare(`
      SELECT e.source, e.target, e.evidence, e.confidence
      FROM edges e WHERE e.relation_type = 'conflicts_with' AND e.confidence >= 0.5
      ORDER BY e.confidence DESC LIMIT 8
    `).all()
    gdb.close()

    if (conflicts.length > 0) {
      findings.push({
        type: 'contradictions',
        title: `⚡ ${conflicts.length} 个潜在矛盾`,
        body: conflicts.map(c =>
          `- ${c.source} ↔ ${c.target}: ${c.evidence?.substring(0, 150) || '存在冲突'} (置信度 ${(c.confidence*100).toFixed(0)}%)`
        ).join('\n')
      })
    }
  } catch(e) {}

  // 3. Success patterns: high-effectiveness memories with solutions
  try {
    const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
    const wins = db.prepare(`
      SELECT key, content, effectiveness_score, injected_count
      FROM semantic WHERE key != '_schema_version'
      AND COALESCE(effectiveness_score, 0.5) > 0.6 AND injected_count >= 2
      AND (content LIKE '%解决%' OR content LIKE '%成功%' OR content LIKE '%works%' OR content LIKE '%fixed%')
      ORDER BY effectiveness_score DESC LIMIT 8
    `).all()
    db.close()

    if (wins.length > 0) {
      findings.push({
        type: 'success_patterns',
        title: `✅ ${wins.length} 个已验证的解决方案`,
        body: wins.map(w =>
          `- ${w.key}: ${w.content?.substring(0, 150)} (有效率 ${(w.effectiveness_score*100).toFixed(0)}%, ${w.injected_count}次验证)`
        ).join('\n')
      })
    }
  } catch(e) {}

  // 4. Knowledge gaps: frequently accessed but never resolved
  try {
    const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
    const gaps = db.prepare(`
      SELECT key, content, access_count, COALESCE(injected_count,0) as ic
      FROM semantic WHERE key != '_schema_version'
      AND access_count >= 5 AND (key LIKE '%blocker%' OR key LIKE '%unresolved%' OR key LIKE '%issue_%'
        OR content LIKE '%尚未解决%' OR content LIKE '%未解决%' OR content LIKE '%待解决%')
      ORDER BY access_count DESC LIMIT 5
    `).all()
    db.close()

    if (gaps.length > 0) {
      findings.push({
        type: 'knowledge_gaps',
        title: `🟡 ${gaps.length} 个高频未解决问题`,
        body: gaps.map(g =>
          `- ${g.key}: 访问 ${g.access_count} 次，注入 ${g.ic} 次但未解决 — ${g.content?.substring(0, 120)}`
        ).join('\n')
      })
    }
  } catch(e) {}

  return {
    analyzed_at: new Date().toISOString(),
    total_findings: findings.length,
    findings
  }
}

function formatFindings(analysis) {
  if (!analysis || analysis.findings.length === 0) return ''
  return '\n## 🔬 自主研究\n\n超脑在你不在的时候分析了记忆库：\n\n' +
    analysis.findings.map(f => `### ${f.title}\n${f.body}`).join('\n\n') +
    '\n\n> 以上基于历史记忆自动分析生成。'
}

module.exports = { analyze, formatFindings }
