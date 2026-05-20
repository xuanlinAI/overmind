const path = require('path')
const ROOT = path.dirname(__filename)

function analyze(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
  const findings = []

  // 1. Repeated failures
  const bad = db.prepare(`
    SELECT key, content, COALESCE(ineffective_count,0) as nc, COALESCE(effectiveness_score,0.5) as eff, COALESCE(injected_count,0) as ic
    FROM semantic WHERE key != '_schema_version' AND ineffective_count >= 3 AND COALESCE(effectiveness_score, 0.5) < 0.3
    ORDER BY ineffective_count DESC LIMIT 10
  `).all()

  if (bad.length > 0) {
    findings.push({
      type: 'repeated_failures',
      title: `🔴 ${bad.length} 个反复失败模式`,
      body: bad.map(f => {
        let edgeInfo = ''
        try {
          const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
          const edges = gdb.prepare(`SELECT source, target, relation_type FROM edges WHERE (source=? OR target=?) AND relation_type IN ('blocked_by','causes') LIMIT 5`).all(f.key, f.key)
          gdb.close()
          if (edges.length) edgeInfo = `\n  关联: ${edges.map(e => `${e.source}—[${e.relation_type}]→${e.target}`).join(', ')}`
        } catch(e) {}
        return `- ${f.key}: 注入${f.ic}次, ${f.nc}次无效 (有效率${(f.eff*100).toFixed(0)}%)${edgeInfo}`
      }).join('\n')
    })
  }

  // 2. Contradictions
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    const conflicts = gdb.prepare(`SELECT source, target, evidence, confidence FROM edges WHERE relation_type='conflicts_with' AND confidence>=0.5 ORDER BY confidence DESC LIMIT 8`).all()
    gdb.close()
    if (conflicts.length) {
      findings.push({
        type: 'contradictions',
        title: `⚡ ${conflicts.length} 个潜在矛盾`,
        body: conflicts.map(c => `- ${c.source}↔${c.target}: ${c.evidence?.substring(0,150)||'存在冲突'} (${(c.confidence*100).toFixed(0)}%)`).join('\n')
      })
    }
  } catch(e) {}

  // 3. Success patterns
  const wins = db.prepare(`
    SELECT key, content, COALESCE(effectiveness_score,0.5) as eff, COALESCE(injected_count,0) as ic
    FROM semantic WHERE key!='_schema_version' AND COALESCE(effectiveness_score,0.5)>0.6 AND injected_count>=2 AND content LIKE '%解决%'
    ORDER BY effectiveness_score DESC LIMIT 8
  `).all()

  if (wins.length) {
    findings.push({
      type: 'success_patterns',
      title: `✅ ${wins.length} 个已验证方案`,
      body: wins.map(w => `- ${w.key}: ${w.content?.substring(0,150)} (有效率${(w.eff*100).toFixed(0)}%, ${w.ic}次验证)`).join('\n')
    })
  }

  // 4. Knowledge gaps
  const gaps = db.prepare(`
    SELECT key, content, access_count, COALESCE(injected_count,0) as ic FROM semantic
    WHERE key!='_schema_version' AND access_count>=5 AND (key LIKE '%blocker%' OR key LIKE '%unresolved%' OR key LIKE '%issue_%' OR content LIKE '%未解决%' OR content LIKE '%尚未解决%')
    ORDER BY access_count DESC LIMIT 5
  `).all()

  if (gaps.length) {
    findings.push({
      type: 'knowledge_gaps',
      title: `🟡 ${gaps.length} 个高频未解问题`,
      body: gaps.map(g => `- ${g.key}: 访问${g.access_count}次, 注入${g.ic}次 — ${g.content?.substring(0,120)}`).join('\n')
    })
  }

  // v4: emit gap found events
  try {
    for (const f of findings) {
      if (f.type === 'knowledge_gaps') require(path.join(ROOT, 'eventbus')).emit('research:gap_found', { key: f.type, topic: f.title })
    }
  } catch(e) {}

  db.close()
  return { analyzed_at: new Date().toISOString(), total_findings: findings.length, findings }
}

function formatFindings(analysis) {
  if (!analysis || analysis.findings.length === 0) return ''
  return '\n## 🔬 自主研究\n\n超脑在你不在的时候分析了记忆库：\n\n' +
    analysis.findings.map(f => `### ${f.title}\n${f.body}`).join('\n\n') +
    '\n\n> 以上基于历史记忆自动分析生成。'
}

module.exports = { analyze, formatFindings }
