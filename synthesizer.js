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

module.exports = { synthesize, formatSyntheses, synthesizeFleet }

function synthesizeFleet(instances) {
  // Cross-CC creative collision: combine other CCs' work with local memory
  if (!instances || instances.length < 2) return null

  try {
    const index = require('./index')
    index.init()

    const syntheses = []

    // For each pair of active instances, look for cross-domain collisions
    const active = instances.filter(i => i.status === 'active')
    for (let i = 0; i < active.length - 1; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j]
        const topicA = (a.topic || '').toLowerCase()
        const topicB = (b.topic || '').toLowerCase()

        // Detect domains with scoring (not first-match)
        const domainPatterns = {
          '逆向': [[/逆向|reverse|encrypt|解密|破解|frida|bytecode|smali|native|so文件|脱壳/i, 3]],
          'API': [[/api|http|fetch|接口|请求|响应|rest|graphql|endpoint|路由/i, 3]],
          '数据': [[/数据|爬虫|scrape|parse|mine|清洗|入库|数据库/i, 2]],
          '安全': [[/审查|review|audit|安全|漏洞|security|渗透/i, 2]],
          '配置': [[/配置|deploy|install|setup|docker|k8s|环境/i, 2]],
        }

        function domainScore(topic, patterns) {
          let score = 0
          for (const entry of patterns) {
            const regex = entry[0], weight = entry[1]
            const matches = (topic.match(new RegExp(regex.source, regex.flags)) || [])
            score += matches.length * weight
          }
          return score
        }

        let bestA = null, bestB = null, bestScoreA = 0, bestScoreB = 0
        for (const [name, patterns] of Object.entries(domainPatterns)) {
          const sa = domainScore(topicA, patterns)
          if (sa > bestScoreA) { bestScoreA = sa; bestA = name }
          const sb = domainScore(topicB, patterns)
          if (sb > bestScoreB) { bestScoreB = sb; bestB = name }
        }

        const domA = bestA && bestScoreA > 0 ? [bestA, null] : null
        const domB = bestB && bestScoreB > 0 ? [bestB, null] : null

        if (domA && domB && domA[0] !== domB[0]) {
          // Cross-domain! Generate hypothesis
          syntheses.push({
            domain_a: domA[0],
            domain_b: domB[0],
            cc_a: a.id?.substring(0, 8) || '?',
            cc_b: b.id?.substring(0, 8) || '?',
            hypothesis: `[${domA[0]} ↔ ${domB[0]}] CC-${a.id?.substring(0, 8)} 在做${domA[0]}工程，CC-${b.id?.substring(0, 8)} 在做${domB[0]}相关。可能产生${domA[0]}+${domB[0]}交叉洞察。`,
            confidence: 0.35,
            verified: false,
            fleet_generated: true
          })
        }
      }
    }

    if (syntheses.length > 0) {
      // Write to file for pipeline pickup
      const fs = require('fs'), path = require('path')
      const sf = path.join(path.dirname(__filename), '.fleet_syntheses.json')
      fs.writeFileSync(sf, JSON.stringify({ syntheses, generated_at: new Date().toISOString() }, null, 2), 'utf-8')
    }

    return syntheses.length > 0 ? { syntheses, total: syntheses.length, fleet_generated: true } : null
  } catch(e) { return null }
}
