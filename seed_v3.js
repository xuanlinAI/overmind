// Seed data to activate all v3 modules
const index = require('./index')
const graph = require('./graph')
index.init()
graph.init()
const db = require('better-sqlite3')('./memory.db')

console.log('=== Seeding v3 Data ===')

// 1. Create causal edges with exposure/outcome → forecast
console.log('[1/8] Causal edges...')
const causalPairs = [
  ['oauth_unresolved', 'api_empty_response', 12, 3],
  ['token_signature_wrong', 'api_empty_response', 8, 1],
  ['wechat_webview_bypass', 'mitmproxy_failed', 6, 0],
  ['rs_vm_no_output', 'token_analysis_stuck', 5, 2],
]
const gdb = require('better-sqlite3')('./graph.db')
for (const [src, tgt, exp, out] of causalPairs) {
  graph.upsertEdge(src, tgt, 'causes', 0.8, '', 'seed')
  gdb.prepare('UPDATE edges SET exposure_count=?, outcome_count=?, succeed_count=?, failure_rate=? WHERE source=? AND target=? AND relation_type=?')
    .run(exp, out, out, Math.round((1-out/Math.max(1,exp))*100)/100, src, tgt, 'causes')
}
gdb.close()
const chain = graph.getCausalChain('oauth_unresolved', 2)
console.log(`  causal chain: ${chain.chains.length} edges, ${chain.summary}`)

// 2. Create skill chains → composer
console.log('[2/8] Skill chains...')
const sessions = ['s_A','s_B','s_C','s_D']
const chains = [['lateral-jump','net-analyze','jsr-reverse'],['lateral-jump','net-analyze'],['elon-code','using-superpowers'],['lateral-jump','net-analyze','enc-signatures']]
for (let i = 0; i < chains.length; i++) {
  for (const skill of chains[i]) {
    index.recordSkillFeedback(skill, 'invoked', '', sessions[i], 0.8)
  }
  index.recordSkillFeedback(chains[i][chains[i].length-1], 'completed', '', sessions[i], 0.9)
}
const comp = require('./composer')
const cr = comp.detectChains(index)
console.log(`  patterns: ${cr.total_patterns}, chains: ${cr.chains.length}`)

// 3. Create old API/config memories → verifier
console.log('[3/8] Old API memories...')
const oldMems = [
  ['api_login_endpoint', 'POST https://api.example.com/login 返回 JWT token', 'api', '2026-05-01'],
  ['api_search_config', '搜索接口超时配置 30s，位于 config.yaml', 'config', '2026-05-03'],
  ['api_payment_url', '支付回调 URL https://pay.example.com/callback', 'api', '2026-04-28'],
  ['api_user_port', '用户服务端口 8080', 'config', '2026-05-05'],
  ['api_legacy_endpoint', '旧版 API https://old.example.com/v1 已废弃', 'api', '2026-04-15'],
]
for (const [key, content, tags, date] of oldMems) {
  db.prepare('INSERT OR IGNORE INTO semantic (key, content, tags, created_at, updated_at) VALUES (?,?,?,?,?)').run(key, content, tags, date, date)
}
const ver = require('./verifier')
const vr = ver.verify(index)
console.log(`  ${vr.summary}`)

// 4. Create cross-project knowledge → transfer
console.log('[4/8] Cross-project knowledge...')
const trans = require('./transfer')
trans.init(db)
const xpData = [
  ['微信开发', 'wechat_oauth_pattern', '微信 OAuth 使用动态签名，token 中间段会随登录变化','project-A', 0.8],
  ['认证安全', 'token_dynamic_sign', '动态 token 需要从业务 JS 实时获取，缓存无效','project-A', 0.9],
  ['逆向工程', 'frida_hook_js', 'Frida 无法直接 hook JS 对象，需从 native 层拦截','project-A', 0.7],
  ['API开发', 'api_empty_response', 'API 返回 200 但 body 为空，检查 X-Sign header','project-B', 0.8],
  ['性能优化', 'mitmproxy_large_data', 'mitmproxy 大流量时用 mitmdump --no-http2','project-A', 0.6],
]
for (const [domain, pattern, insight, src, conf] of xpData) {
  db.prepare('INSERT OR IGNORE INTO cross_project (domain, pattern, insight, source_project, confidence, use_count) VALUES (?,?,?,?,?,?)').run(domain, pattern, insight, src, conf, 1)
}
const tr = trans.getTransferable('token API 签名')
console.log(`  transferable: ${tr.length} items`)

// 5. Create conflicts → arbitrator
console.log('[5/8] Conflicts...')
const conflictPairs = [
  ['wechat_uses_ie_proxy', 'wechat_bypasses_ie_proxy', '微信使用 IE 代理 vs 绕过 IE 代理', 0.7],
  ['token_is_static', 'token_is_dynamic', 'token 静态 vs 动态', 0.6],
  ['use_mitmproxy', 'use_frida', '用 mitmproxy vs 用 Frida', 0.5],
]
for (const [a, b, evidence, conf] of conflictPairs) {
  db.prepare('INSERT OR IGNORE INTO semantic (key, content, tags, effectiveness_score, updated_at) VALUES (?,?,?,?,?)').run(a, evidence?.split(' vs ')[0] || a, 'conflict', 0.5, '2026-05-10')
  db.prepare('INSERT OR IGNORE INTO semantic (key, content, tags, effectiveness_score, updated_at) VALUES (?,?,?,?,?)').run(b, evidence?.split(' vs ')[1] || b, 'conflict', 0.5, '2026-05-12')
  graph.upsertEdge(a, b, 'conflicts_with', conf, evidence, 'seed')
}
const arb = require('./arbitrator')
const ar = arb.resolve(index, graph)
console.log(`  resolved: ${ar.resolved}`)

// 6. Create memory clusters → compress
console.log('[6/8] Memory clusters...')
for (let i = 1; i <= 5; i++) {
  db.prepare('INSERT OR IGNORE INTO semantic (key, content, tags, confidence) VALUES (?,?,?,?)').run(`token_issue_${i}`, `token 相关的问题 ${i}: ${i%2===0?'签名过期':'格式错误'}`, 'token', 0.5)
}
const compr = require('./compress')
const cr2 = compr.compress(index, 2)
console.log(`  merged: ${cr2.merged}, saved: ${cr2.saved_entries}`)

// 7. Create git-anchored memories → timetravel
console.log('[7/8] Git-anchored memories...')
const commits = ['a1b2c3d','e4f5g6h','i7j8k9l','m0n1o2p']
for (let i = 0; i < commits.length; i++) {
  const date = `2026-05-${15+i}`
  db.prepare('INSERT OR IGNORE INTO semantic (key, content, tags, commit_hash, created_at) VALUES (?,?,?,?,?)').run(`milestone_${i}`, `第${i+1}次尝试: ${i===0?'发现token问题':i===1?'定位到RS VM':i===2?'成功提取签名':'验证通过'}`, 'milestone', commits[i], date)
}
const tt = require('./timetravel')
const ttr = tt.travel(index, '2026-05-17')
console.log(`  timeline: ${ttr.memory_count} memories, ${ttr.open_issues} issues`)

// 8. Write dream findings → dream
console.log('[8/8] Dream findings...')
const dreamData = {
  dreamed_at: new Date().toISOString(),
  stats: index.getStats(),
  summary: '昨夜分析了 2800+ 条记忆，发现 OAuth 绕过是所有 token 问题的共同前置条件，建议优先解决',
  merges: [
    { fragment_keys: ['token_issue_1','token_issue_2','token_issue_3'], merged_fact: 'token 问题的三种表现形式(签名过期/格式错误/空响应)均源于 OAuth 会话过期' },
    { fragment_keys: ['wechat_uses_ie_proxy','wechat_bypasses_ie_proxy'], merged_fact: '微信 webview 在桌面端使用 IE 代理，但 XWeb 引擎绕过系统代理——两者并存于不同场景' },
  ],
  arbitrations: [
    { conflict: 'mitmproxy vs Frida', winner: '组合使用', verdict: 'mitmproxy 抓包获取 token 样本，Frida 深入分析 VM 执行——两者互补非互斥' },
  ],
  critical_gaps: [
    { issue: 'OAuth 自动续期', severity: 'high', impact: '不解决会导致所有 token 在 2 小时后过期，API 路径始终不稳定' },
    { issue: 'RS VM 字节码完整逆向', severity: 'high', impact: '当前只能提取 token 不能生成——完整逆向才能脱离浏览器' },
  ],
  patterns: [
    { pattern: 'token 问题 → 先查 OAuth → 再查 RS VM', evidence: '3 次成功修复均遵循此路径', recommendation: '遇到 token 问题优先检查 OAuth 会话状态' },
  ],
  prediction: { most_likely: 'OAuth 绕过问题将在 2-3 个会话内解决', confidence: 0.7, alternative: '需要更深入的微信协议逆向' },
}
const fs = require('fs')
fs.writeFileSync('./.dream_findings.json', JSON.stringify(dreamData, null, 2))

// Summary
console.log('')
console.log('=== SEED COMPLETE ===')
console.log(`memory.db: ${db.prepare('SELECT COUNT(*) FROM semantic').get()['COUNT(*)']} mems`)
console.log(`graph.db: ${require('better-sqlite3')('./graph.db').prepare('SELECT COUNT(*) FROM edges').get()['COUNT(*)']} edges`)
console.log(`skill_feedback: ${db.prepare('SELECT COUNT(*) FROM skill_feedback').get()['COUNT(*)']} events`)
console.log(`skill_prefs: ${db.prepare('SELECT COUNT(*) FROM skill_prefs').get()['COUNT(*)']} prefs`)
console.log(`cross_project: ${db.prepare('SELECT COUNT(*) FROM cross_project').get()['COUNT(*)']} items`)
db.close()
console.log('Restart CC to see all v3 modules active.')
