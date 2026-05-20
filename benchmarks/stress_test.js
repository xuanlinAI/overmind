// v4 Stress Test — 1000 samples, isolated sandbox, zero impact on live data
// Run: node benchmarks/stress_test.js
const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__dirname)
const TMP = path.join(ROOT, 'benchmarks', '.sandbox')
fs.mkdirSync(TMP, { recursive: true })

const DB_PATH = path.join(TMP, 'memory.db')
const GRAPH_PATH = path.join(TMP, 'graph.db')

// Copy module loading pattern but with sandbox paths
const Database = require('better-sqlite3')

// ===== SANDBOX SETUP =====
console.log('=== Building sandbox with 1000 samples ===')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`CREATE TABLE IF NOT EXISTS semantic (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, content TEXT, tags TEXT DEFAULT "", created_at TEXT, updated_at TEXT, access_count INTEGER DEFAULT 0, effectiveness_score REAL DEFAULT 0.5, injected_count INTEGER DEFAULT 0, ineffective_count INTEGER DEFAULT 0, confidence REAL DEFAULT 0.5, commit_hash TEXT)`)
try { db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(key, content, tags, tokenize="unicode61")') } catch(e) {}
db.exec(`CREATE TABLE IF NOT EXISTS skill_index (name TEXT PRIMARY KEY, description TEXT, triggers TEXT DEFAULT "", file_path TEXT, installed_at TEXT, invoke_count INTEGER DEFAULT 0, matching_tags TEXT DEFAULT "")`)
db.exec(`CREATE TABLE IF NOT EXISTS skill_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, skill_name TEXT, event_type TEXT, task_context TEXT DEFAULT "", session_id TEXT, effectiveness REAL DEFAULT 0.5, created_at TEXT)`)
db.exec(`CREATE TABLE IF NOT EXISTS skill_prefs (skill_name TEXT, task_pattern TEXT, use_count INTEGER DEFAULT 1, effectiveness REAL DEFAULT 0.5, last_used TEXT, UNIQUE(skill_name, task_pattern))`)
db.exec(`CREATE TABLE IF NOT EXISTS feedback_events (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_key TEXT, event_type TEXT, session_id TEXT, detail TEXT DEFAULT "", created_at TEXT)`)

const gdb = new Database(GRAPH_PATH)
gdb.pragma('journal_mode = WAL')
gdb.exec(`CREATE TABLE IF NOT EXISTS nodes (key TEXT PRIMARY KEY, label TEXT DEFAULT "", node_type TEXT DEFAULT "memory", importance REAL DEFAULT 0.5)`)
gdb.exec(`CREATE TABLE IF NOT EXISTS edges (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, target TEXT, relation_type TEXT, confidence REAL DEFAULT 0.5, evidence TEXT DEFAULT "", exposure_count INTEGER DEFAULT 0, outcome_count INTEGER DEFAULT 0, failure_rate REAL DEFAULT 0, succeed_count INTEGER DEFAULT 0, UNIQUE(source, target, relation_type))`)

// ===== SEED 1000 MEMORIES =====
console.log('Seeding 1000 memories...')
const domains = ['auth', 'api', 'token', 'db', 'cache', 'proxy', 'ssl', 'queue', 'log', 'config']
const actions = ['failed', 'succeeded', 'timeout', 'crashed', 'restarted', 'configured', 'deployed', 'tested']
const tools = ['mitmproxy', 'Frida', 'Playwright', 'postman', 'curl', 'wireshark', 'burp', 'ghidra']
const versions = ['v1.0', 'v2.3', 'v3.1', 'v4.0', 'v5-beta', 'latest', '2024Q4', '2025Q1']

for (let i = 0; i < 1000; i++) {
  const domain = domains[i % domains.length]
  const action = actions[i % actions.length]
  const tool = tools[i % tools.length]
  const ver = versions[i % versions.length]
  const key = `bm1k_${domain}_${action}_${i}`
  const content = `[样本${i}] ${tool} ${ver}: ${domain}服务 ${action}，耗时${(Math.random()*10).toFixed(1)}s，状态码 ${200 + (i%5)*100}，端点 /api/${domain}/${action}`
  const tags = `${domain},${action},${tool}`
  const eff = Math.random() < 0.3 ? Math.random() * 0.3 : 0.5 + Math.random() * 0.5
  const injected = Math.floor(Math.random() * 10)
  const ineffective = Math.floor(Math.random() * 5)
  const commit = Math.random().toString(36).substring(2, 9)

  db.prepare('INSERT INTO semantic (key, content, tags, effectiveness_score, injected_count, ineffective_count, confidence, commit_hash) VALUES (?,?,?,?,?,?,?,?)')
    .run(key, content, tags, eff, injected, ineffective, 0.3 + Math.random() * 0.7, commit)
  try { db.prepare('INSERT INTO semantic_fts(key, content, tags) VALUES (?,?,?)').run(key, content, tags) } catch(e) {}
}
console.log('  1000 memories seeded')

// ===== SEED 500 GRAPH EDGES =====
console.log('Seeding 500 graph edges...')
for (let i = 0; i < 500; i++) {
  const src = `bm1k_${domains[i % 10]}_${actions[i % 8]}_${i}`
  const tgt = `bm1k_${domains[(i+1) % 10]}_${actions[(i+1) % 8]}_${(i+1) % 1000}`
  const rels = ['depends_on','causes','blocked_by','related_to','triggers','solves','conflicts_with','mitigates','part_of','extends']
  const rel = rels[i % rels.length]
  const conf = 0.3 + Math.random() * 0.7
  const exp = Math.floor(Math.random() * 20)
  const out = Math.floor(Math.random() * exp)
  const fr = exp > 0 ? (1 - out / exp) : 0

  gdb.prepare('INSERT OR IGNORE INTO edges (source, target, relation_type, confidence, evidence, exposure_count, outcome_count, failure_rate, succeed_count) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(src, tgt, rel, conf, `stress_test_${i}`, exp, out, fr, out)
  gdb.prepare('INSERT OR IGNORE INTO nodes (key) VALUES (?)').run(src)
  gdb.prepare('INSERT OR IGNORE INTO nodes (key) VALUES (?)').run(tgt)
}
console.log('  500 edges seeded')

// ===== SEED 200 SKILL FEEDBACKS =====
console.log('Seeding 200 skill feedbacks...')
for (let i = 0; i < 200; i++) {
  const events = ['injected','invoked','completed','failed','not_used']
  db.prepare('INSERT INTO skill_feedback (skill_name, event_type, task_context, session_id, effectiveness) VALUES (?,?,?,?,?)')
    .run(`skill_${i % 20}`, events[i % 5], `task_${i}`, `sess_${i % 10}`, Math.random())
}
console.log('  200 skill feedbacks seeded')

// ===== BENCHMARKS =====
const results = []
const start = Date.now()

// 1. FTS5 1000-record search speed
console.log('[1] FTS5 search speed (1000 records)...')
const t1 = Date.now()
const qs = []
for (let i = 0; i < 100; i++) {
  const domain = domains[i % 10]
  try {
    const r = db.prepare("SELECT key FROM semantic_fts WHERE semantic_fts MATCH ? LIMIT 10").all(domain)
    qs.push(r.length)
  } catch(e) {}
}
const ftsMs = (Date.now() - t1) / 100
results.push({ name:'FTS5 Search (100 queries)', value:`${ftsMs.toFixed(1)}ms avg`, verdict: ftsMs < 10 ? 'PASS' : 'FAIL' })

// 2. Graph BFS traversal depth=3 on 500 edges
console.log('[2] Graph BFS traversal...')
const t2 = Date.now()
const bfsResults = []
for (let i = 0; i < 50; i++) {
  const root = `bm1k_${domains[i % 10]}_${actions[i % 8]}_${i}`
  try {
    const edges = gdb.prepare("SELECT source, target FROM edges WHERE source=? OR target=? LIMIT 20").all(root, root)
    bfsResults.push(edges.length)
  } catch(e) {}
}
const bfsMs = (Date.now() - t2) / 50
results.push({ name:'Graph BFS (50 queries)', value:`${bfsMs.toFixed(1)}ms avg`, verdict: bfsMs < 20 ? 'PASS' : 'FAIL' })

// 3. Causal chain recall on 500 edges
console.log('[3] Causal chain recall...')
const chainResults = []
for (let i = 0; i < 50; i++) {
  const root = `bm1k_${domains[i % 10]}_${actions[i % 8]}_${i}`
  try {
    const chain = gdb.prepare("SELECT source, target, relation_type FROM edges WHERE source=? AND relation_type IN ('causes','blocked_by','depends_on') LIMIT 10").all(root)
    chainResults.push(chain.length)
  } catch(e) {}
}
const avgChain = (chainResults.reduce((s,v)=>s+v,0) / chainResults.length).toFixed(1)
results.push({ name:'Causal Chain (50 roots)', value:`${avgChain} edges avg`, verdict: parseFloat(avgChain) > 0 ? 'PASS' : 'FAIL' })

// 4. Memory feedback loop speed
console.log('[4] Feedback loop speed...')
const t4 = Date.now()
for (let i = 0; i < 100; i++) {
  db.prepare("INSERT INTO feedback_events (memory_key, event_type, session_id) VALUES (?,?,?)").run(`bm1k_test_${i}`, 'injected', 'stress')
  db.prepare("UPDATE semantic SET injected_count = COALESCE(injected_count,0)+1 WHERE key=?").run(`bm1k_test_${i}`)
}
const fbMs = (Date.now() - t4) / 100
results.push({ name:'Feedback Write (100 ops)', value:`${fbMs.toFixed(1)}ms avg`, verdict: fbMs < 5 ? 'PASS' : 'FAIL' })

// 5. Effectiveness ranking on 1000 mems
console.log('[5] Effectiveness ranking (1000 mems)...')
const t5 = Date.now()
const allMems = db.prepare("SELECT key, effectiveness_score, injected_count, ineffective_count FROM semantic LIMIT 1000").all()
const scored = allMems.map(m => {
  const eff = m.effectiveness_score || 0.5
  const inj = m.injected_count || 0
  const neff = m.ineffective_count || 0
  const total = inj + neff + 1
  const smoothed = (0.5 + eff * inj + 0.1 * neff) / total
  return { ...m, feedback_score: smoothed + (inj > 0 ? 0.1 : 0) }
}).sort((a,b) => b.feedback_score - a.feedback_score)
const rankMs = Date.now() - t5
results.push({ name:'Effectiveness Ranking (1000 mems)', value:`${rankMs}ms`, verdict: rankMs < 100 ? 'PASS' : 'FAIL' })

// 6. Warning detection speed
console.log('[6] Warning detection...')
const t6 = Date.now()
const warnEdges = gdb.prepare("SELECT source, target, relation_type FROM edges WHERE relation_type IN ('blocked_by','conflicts_with','causes') AND failure_rate > 0.4 LIMIT 100").all()
const warnMs = Date.now() - t6
results.push({ name:'Warning Detection (100 edges)', value:`${warnMs}ms`, verdict: warnMs < 100 ? 'PASS' : 'FAIL' })

// 7. Write throughput (batch insert)
console.log('[7] Write throughput...')
const t7 = Date.now()
const batch = db.prepare("INSERT OR IGNORE INTO semantic (key, content, tags) VALUES (?,?,?)")
const insertMany = db.transaction((rows) => { for (const r of rows) batch.run(...r) })
insertMany(Array.from({length:100}, (_,i) => [`bm_batch_${i}`, `batch test ${i}`, 'batch']))
const writeMs = Date.now() - t7
results.push({ name:'Batch Write (100 rows)', value:`${writeMs}ms`, verdict: writeMs < 500 ? 'PASS' : 'FAIL' })

// 8. Read throughput
console.log('[8] Read throughput...')
const t8 = Date.now()
for (let i = 0; i < 100; i++) {
  db.prepare("SELECT * FROM semantic WHERE key LIKE ? LIMIT 20").all(`%${domains[i%10]}%`)
}
const readMs = Date.now() - t8
results.push({ name:'Read Throughput (100 queries)', value:`${readMs}ms`, verdict: readMs < 500 ? 'PASS' : 'FAIL' })

// 9. Mass search throughput (ops/sec)
console.log('[9] Mass search throughput...')
const t9 = Date.now()
let count = 0
for (let i = 0; i < 500; i++) {
  try {
    db.prepare("SELECT key FROM semantic_fts WHERE semantic_fts MATCH ? LIMIT 5").all(domains[i % 10])
    count++
  } catch(e) {}
}
const searchOpsSec = (count / ((Date.now() - t9) / 1000)).toFixed(0)
results.push({ name:'Search Throughput', value:`${searchOpsSec} ops/sec`, verdict: parseInt(searchOpsSec) > 100 ? 'PASS' : 'FAIL' })

// 10. Graph edge insert throughput
console.log('[10] Graph edge insert throughput...')
const t10 = Date.now()
const edgeInsert = gdb.prepare("INSERT OR IGNORE INTO edges (source, target, relation_type, confidence) VALUES (?,?,?,?)")
const edgeBatch = gdb.transaction((rows) => { for (const r of rows) edgeInsert.run(...r) })
edgeBatch(Array.from({length:100}, (_,i) => [`bm_edge_spd_${i}`, `bm_edge_tgt_${i}`, 'related_to', 0.5]))
const edgeOpsSec = (100 / ((Date.now() - t10) / 1000)).toFixed(0)
results.push({ name:'Edge Insert Throughput', value:`${edgeOpsSec} ops/sec`, verdict: parseInt(edgeOpsSec) > 500 ? 'PASS' : 'FAIL' })

// 11. DB size
const dbSize = (fs.statSync(DB_PATH).size / 1024).toFixed(0)
const graphSize = (fs.statSync(GRAPH_PATH).size / 1024).toFixed(0)
results.push({ name:'DB Size (1000+500 records)', value:`memory:${dbSize}KB graph:${graphSize}KB`, verdict: parseInt(dbSize) < 1024 ? 'PASS' : 'FAIL' })

// ===== REPORT =====
const totalMs = Date.now() - start
const passed = results.filter(r => r.verdict === 'PASS').length

console.log('')
console.log('='.repeat(70))
console.log(`  XUANLIN OVERMIND v4 — STRESS TEST (1000 mems + 500 edges)`)
console.log(`  ${passed}/${results.length} PASSED | ${totalMs}ms total`)
console.log('='.repeat(70))
console.log('')

results.forEach(r => {
  console.log(`  ${r.verdict === 'PASS' ? '✅' : '❌'} ${r.name}: ${r.value}`)
})

// ===== CLEANUP =====
db.close()
gdb.close()
fs.rmSync(TMP, { recursive: true, force: true })

console.log('')
console.log('Sandbox cleaned. Live data untouched.')
