// Full v4 Benchmark Suite — tests all measurable functions
// Run: node benchmarks/full_suite.js
const path = require('path')
const ROOT = path.dirname(__dirname)
const fs = require('fs')
const index = require(path.join(ROOT, 'index'))
const graph = require(path.join(ROOT, 'graph'))
index.init(); graph.init()

const results = []

function add(name, data) {
  const passed = data.verdict === 'PASS'
  results.push({ name, ...data, passed })
}

function cleanup() {
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
  db.prepare("DELETE FROM semantic WHERE key LIKE 'bm_%'").run()
  db.prepare("DELETE FROM skill_prefs WHERE skill_name LIKE 'bm_%'").run()
  db.prepare("DELETE FROM skill_feedback WHERE skill_name LIKE 'bm_%'").run()
  db.prepare("DELETE FROM feedback_events WHERE memory_key LIKE 'bm_%'").run()
  db.close()
  const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
  gdb.prepare("DELETE FROM edges WHERE source LIKE 'bm_%' OR target LIKE 'bm_%'").run()
  gdb.prepare("DELETE FROM nodes WHERE key LIKE 'bm_%'").run()
  gdb.close()
}

// ============================================================
// 1. Memory Write + Read
console.log('[1/20] Memory Write + Read...')
const testKey = 'bm_test_key_' + Date.now()
const testContent = 'Benchmark test fact: API endpoint https://api.example.com/v2 returns JWT with 3600s expiry'
index.saveSemantic(testKey, testContent, 'benchmark,api')
const mems = index.searchHybrid('JWT expiry API', 5)
const found = mems.find(m => m.key === testKey)
add('1. Memory Write+Read', {
  verdict: found ? 'PASS' : 'FAIL',
  score: found ? found.combined?.toFixed(2) : 0,
  detail: found ? `Found in ${mems.length} results` : 'Not found'
})

// 2. FTS5 Chinese Search
console.log('[2/20] FTS5 Chinese Search...')
const cnKey = 'bm_cn_' + Date.now()
index.saveSemantic(cnKey, '微信 OAuth 签名算法使用 HMAC-SHA256，token 有效期 7200 秒', 'auth,wechat')
const cnResults = index.searchHybrid('微信 OAuth 签名', 3)
add('2. FTS5 Chinese Search', {
  verdict: cnResults.length > 0 ? 'PASS' : 'FAIL',
  detail: `Found ${cnResults.length} results for Chinese query`
})

// 3. Graph Edge Upsert + Query
console.log('[3/20] Graph Edge Upsert...')
const a = 'bm_graph_a', b = 'bm_graph_b'
graph.upsertEdge(a, b, 'depends_on', 0.9, 'test dependency', 'benchmark')
const neighbors = graph.getNeighbors(a, 1)
add('3. Graph Edge Query', {
  verdict: neighbors.edges.length > 0 ? 'PASS' : 'FAIL',
  detail: `${neighbors.edges.length} edges, ${neighbors.nodes.length} nodes`
})

// 4. Graph Expansion
console.log('[4/20] Graph Expansion...')
const expanded = graph.expandKeys([a], 1)
add('4. Graph Expansion', {
  verdict: expanded.keys.includes(b) ? 'PASS' : 'FAIL',
  detail: `${expanded.keys.length} keys expanded`
})

// 5. Causal Chain (re-uses edges from benchmark 1)
console.log('[5/20] Causal Chain...')
graph.upsertEdge('bm_cause', 'bm_effect_1', 'causes', 0.8, '', 'benchmark')
graph.upsertEdge('bm_cause', 'bm_effect_2', 'blocked_by', 0.7, '', 'benchmark')
const chain = graph.getCausalChain('bm_cause', 2)
add('5. Causal Chain Traversal', {
  verdict: chain.chains.length >= 2 ? 'PASS' : 'FAIL',
  detail: `${chain.chains.length} causal edges found`
})

// 6. Warning Detection
console.log('[6/20] Warning Detection...')
graph.upsertEdge('bm_warn_src', 'bm_warn_tgt', 'blocked_by', 0.9, 'blocks progress', 'benchmark')
const fb = { 'bm_warn_tgt': { effectiveness: 0.3, injected_count: 3, ineffective_count: 3 } }
const warnings = graph.getWarnings(['bm_warn_src'], fb)
add('6. Warning Detection', {
  verdict: warnings.length > 0 ? 'PASS' : 'FAIL',
  detail: `${warnings.length} warnings detected`
})

// 7. Conflict Detection
console.log('[7/20] Conflict Detection...')
graph.upsertEdge('bm_conf_a', 'bm_conf_b', 'conflicts_with', 0.7, '', 'benchmark')
const fb2 = { 'bm_conf_b': { effectiveness: 0.3, injected_count: 1, ineffective_count: 0 } }
const warns2 = graph.getWarnings(['bm_conf_a'], fb2)
const hasConflict = warns2.some(w => w.danger_type === 'conflict')
add('7. Conflict Detection', {
  verdict: hasConflict ? 'PASS' : 'FAIL',
  detail: hasConflict ? 'Conflict detected' : 'No conflict found'
})

// 8. Skill Search + Ranking
console.log('[8/20] Skill Search...')
const skills = index.searchSkills('逆向 JS 加密 token', 5)
add('8. Skill Keyword Search', {
  verdict: skills.length > 0 ? 'PASS' : 'FAIL',
  detail: `${skills.length} skills matched`
})

// 9. Skill Preference Recording
console.log('[9/20] Skill Preference...')
index.upsertSkillPref('bm_test_skill', 'Benchmark 测试场景', 0.9)
const prefs = index.getSkillPrefs('bm_test_skill')
add('9. Skill Preference CRUD', {
  verdict: prefs.length > 0 ? 'PASS' : 'FAIL',
  detail: `${prefs.length} prefs for test skill`
})

// 10. Skill Feedback Recording
console.log('[10/20] Skill Feedback...')
index.recordSkillFeedback('bm_test_skill', 'injected', 'benchmark task', 'bench_session')
index.recordSkillFeedback('bm_test_skill', 'completed', 'benchmark task', 'bench_session', 0.9)
const rankings = index.getSkillRankings(10)
const rk = rankings.find(r => r.skill_name === 'bm_test_skill')
add('10. Skill Feedback Pipeline', {
  verdict: rk && rk.completed > 0 ? 'PASS' : 'FAIL',
  detail: rk ? `Completed:${rk.completed} Invoked:${rk.invoked}` : 'Not found'
})

// 11. Memory Feedback
console.log('[11/20] Memory Feedback...')
index.recordFeedback('bm_fb_test', 'injected', 'bench')
index.recordFeedback('bm_fb_test', 'helped', 'bench')
const memFb = index.getMemoryFeedback('bm_fb_test')
add('11. Memory Feedback Loop', {
  verdict: memFb && memFb.events.injected > 0 ? 'PASS' : 'FAIL',
  detail: `${JSON.stringify(memFb?.events)}`
})

// 12. Effectiveness Ranking
console.log('[12/20] Effectiveness Ranking...')
const effMems = [
  { key:'bm_eff_a', effectiveness_score:0.1, injected_count:5, ineffective_count:5, combined:0.3 },
  { key:'bm_eff_b', effectiveness_score:0.9, injected_count:3, ineffective_count:0, combined:0.7 },
]
const ranked = index.rankByEffectiveness(effMems)
add('12. Effectiveness Ranking', {
  verdict: ranked[0].key === 'bm_eff_b' ? 'PASS' : 'FAIL',
  detail: `Top:${ranked[0].key} Bottom:${ranked[ranked.length-1].key}`
})

// 13. Persona Analysis
console.log('[13/20] Persona Analysis...')
const persona = require(path.join(ROOT, 'persona'))
const profile = persona.analyze(index)
add('13. Persona Analysis', {
  verdict: profile && profile.traits && profile.traits.length > 0 ? 'PASS' : 'FAIL',
  detail: `${profile?.traits?.length || 0} traits: ${profile?.traits?.map(t=>t.name).join(',')}`
})

// 14. Anomaly Detection
console.log('[14/20] Anomaly Detection...')
const anomaly = require(path.join(ROOT, 'anomaly'))
const anom = anomaly.detect(index, 'benchmark test task')
add('14. Anomaly Detection', {
  verdict: Array.isArray(anom) ? 'PASS' : 'FAIL',
  detail: `${anom.length} anomalies found`
})

// 15. Budget Scoring
console.log('[15/20] Memory Budget...')
const budget = require(path.join(ROOT, 'budget'))
const fakeMem = { effectiveness_score:0.8, access_count:15, injected_count:8, ineffective_count:0, age_days:5, tags:'' }
const score = budget.scoreMemory(fakeMem)
add('15. Memory Budget Scoring', {
  verdict: score > 0.5 ? 'PASS' : 'FAIL',
  detail: `Score:${score} (expected >0.5)`
})

// 16. Knowledge Verification
console.log('[16/20] Knowledge Verification...')
const verifier = require(path.join(ROOT, 'verifier'))
const vf = verifier.verify(index)
add('16. Knowledge Verification', {
  verdict: vf && typeof vf.scanned === 'number' ? 'PASS' : 'FAIL',
  detail: `Scanned:${vf.scanned} Demoted:${vf.demoted}`
})

// 17. Compressor
console.log('[17/20] Memory Compression...')
const compress = require(path.join(ROOT, 'compress'))
const cr = compress.compress(index, 2)
add('17. Memory Compression', {
  verdict: cr && typeof cr.merged === 'number' ? 'PASS' : 'FAIL',
  detail: `Merged:${cr.merged} Analyzed:${cr.clusters_analyzed}`
})

// 18. Arbitrator
console.log('[18/20] Conflict Arbitration...')
const arb = require(path.join(ROOT, 'arbitrator'))
const ar = arb.resolve(index, graph)
add('18. Conflict Arbitration', {
  verdict: ar && typeof ar.resolved === 'number' ? 'PASS' : 'FAIL',
  detail: `Resolved:${ar.resolved}`
})

// 19. Event Bus
console.log('[19/20] Event Bus...')
const bus = require(path.join(ROOT, 'eventbus'))
let eventReceived = false
bus.on('bm_test_event', () => { eventReceived = true })
bus.emit('bm_test_event', { test: true })
add('19. Event Bus Pub/Sub', {
  verdict: eventReceived ? 'PASS' : 'FAIL',
  detail: eventReceived ? 'Event received' : 'No event received'
})

// 20. Inter-Process Queue
console.log('[20/20] Inter-Process Queue...')
const wiring = require(path.join(ROOT, 'wiring'))
wiring.pushInterProcess('bm_test', { msg: 'hello' })
const drained = wiring.drainInterProcess(3600000)
add('20. IPC Event Queue', {
  verdict: drained.length > 0 ? 'PASS' : 'FAIL',
  detail: `${drained.length} events drained`
})

// Cleanup
cleanup()

// Print summary
const passed = results.filter(r => r.passed).length
const failed = results.length - passed
console.log('')
console.log('='.repeat(60))
console.log(`  XUANLIN OVERMIND v4 — FULL BENCHMARK SUITE`)
console.log(`  ${passed}/${results.length} PASSED | ${failed} FAILED`)
console.log('='.repeat(60))
console.log('')

const table = results.map(r => ({ Benchmark: r.name, Verdict: r.passed ? '✅' : '❌', Detail: r.detail }))
// Print as JSON for downstream
console.log(JSON.stringify({ passed, total: results.length, results: table }, null, 2))
