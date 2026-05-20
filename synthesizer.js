// Creative Synthesis — cross-domain memory collision → new hypotheses
const path = require('path')
const ROOT = path.dirname(__filename)

function synthesize(index, graph) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Strategy: find high-confidence memories in DIFFERENT domains
  // that are NOT directly connected in the graph
  // but share structural similarities → potential creative insight

  const domains = ['auth','api','token','proxy','db','cache','ssl','vm','frida','wechat']
  const memsByDomain = {}

  for (const d of domains) {
    memsByDomain[d] = db.prepare(`SELECT key, content, tags, COALESCE(effectiveness_score,0.5) as eff FROM semantic WHERE key!='_schema_version' AND (key LIKE ? OR content LIKE ?) AND COALESCE(effectiveness_score,0.5) > 0.4 ORDER BY eff DESC LIMIT 5`).all(`%${d}%`, `%${d}%`)
  }

  const syntheses = []
  const domainList = Object.keys(memsByDomain).filter(d => memsByDomain[d].length > 0)

  // Cross-domain collision: pair domains that are far apart
  for (let i = 0; i < domainList.length - 1; i++) {
    for (let j = i + 1; j < domainList.length; j++) {
      const d1 = domainList[i], d2 = domainList[j]
      const mems1 = memsByDomain[d1], mems2 = memsByDomain[d2]
      if (mems1.length === 0 || mems2.length === 0) continue

      // Check if these domains are NOT directly connected in graph
      let areConnected = false
      try {
        const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
        const edges = gdb.prepare(`SELECT COUNT(*) as c FROM edges WHERE (source LIKE ? AND target LIKE ?) OR (source LIKE ? AND target LIKE ?)`).get(`%${d1}%`, `%${d2}%`, `%${d2}%`, `%${d1}%`)
        areConnected = edges.c > 0
        gdb.close()
      } catch(e) {}

      if (!areConnected) {
        const a = mems1[0], b = mems2[0]
        // Generate synthesis hypothesis
        const hypothesis = `[${d1} ↔ ${d2}] ${a.content?.substring(0,60)}... 可能与 ${b.content?.substring(0,60)}... 存在未知关联`

        syntheses.push({
          domain_a: d1, domain_b: d2,
          seed_a: a.key, seed_b: b.key,
          confidence: 0.3 + (a.eff + b.eff) / 4, // Higher if both memories are reliable
          hypothesis,
          verified: false
        })
      }
    }
  }

  db.close()

  // Sort by confidence, take top
  syntheses.sort((a, b) => b.confidence - a.confidence)

  return {
    syntheses: syntheses.slice(0, 8),
    total_collisions: syntheses.length,
    domains_analyzed: domainList.length
  }
}

function formatSyntheses(result) {
  if (!result || result.syntheses.length === 0) return ''
  return '\n## ⚡ 创意合成\n\n' +
    '超脑将不同领域的记忆碰撞，生成待验证假说：\n\n' +
    result.syntheses.slice(0, 5).map((s, i) =>
      `### 假说 ${i+1}: ${s.domain_a} ↔ ${s.domain_b}\n` +
      `${s.hypothesis}\n` +
      `> ⚡ 创意合成 — 未经验证，请自行判断。置信度: ${(s.confidence*100).toFixed(0)}%`
    ).join('\n\n') + '\n'
}

module.exports = { synthesize, formatSyntheses }
