// Gatekeeper — high-risk operation detector with graph forensic
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)

const HIGH_RISK = [
  /rm\s+-rf\s+/i, /rm\s+-r\s+/i,
  /git\s+push\s+--force/i, /git\s+push\s+-f\b/i,
  /DROP\s+TABLE/i, /DROP\s+DATABASE/i,
  /TRUNCATE\s+TABLE/i, /DELETE\s+FROM\s+\w+\s+WHERE/i,
  /chmod\s+777/i, /chmod\s+-R\s+777/i,
  /format\s+[cdef]:/i, /dd\s+if=/i,
  /\.remove\(\)/i, /\.unlink\(\)/i,
  /process\.exit/i, /process\.kill/i,
]

function scan(command) {
  if (!command) return null
  const matches = []
  for (const pattern of HIGH_RISK) {
    if (pattern.test(command)) matches.push(pattern.source)
  }
  if (matches.length === 0) return null

  // Query graph for similar dangerous operations
  let warnings = []
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    for (const kw of ['rm','force push','drop','delete','kill','format']) {
      if (!command.toLowerCase().includes(kw)) continue
      const rows = gdb.prepare(`SELECT source,target,relation_type,COALESCE(failure_rate,0) as fr,evidence FROM edges WHERE evidence LIKE ? AND failure_rate>0 LIMIT 3`).all(`%${kw}%`)
      for (const r of rows) {
        warnings.push({ keyword: kw, cause: r.source, effect: r.target, failure_rate: r.fr, evidence: (r.evidence||'').substring(0,100) })
      }
    }
    gdb.close()
  } catch(e) {}

  return {
    command: command.substring(0, 200),
    matched_patterns: matches.length,
    risk_level: matches.length >= 3 ? 'CRITICAL' : matches.length >= 2 ? 'HIGH' : 'MEDIUM',
    historical_warnings: warnings.slice(0, 5),
    confirmation_required: true
  }
}

function format(scan) {
  if (!scan) return ''
  return `\n## 🛑 安全拦截\n\n` +
    `**风险等级: ${scan.risk_level}**\n` +
    `**操作:** \`${scan.command}\`\n` +
    `**匹配风险模式:** ${scan.matched_patterns} 个\n` +
    (scan.historical_warnings.length ? `\n### 历史类似操作曾导致:\n` +
      scan.historical_warnings.map(w => `- ${w.cause} → ${w.effect} (失败率 ${(w.failure_rate*100).toFixed(0)}%)`).join('\n') + '\n' : '') +
    `\n> ⚠️ 此操作需要确认后才执行。请先评估影响范围。`
}

module.exports = { scan, format }
