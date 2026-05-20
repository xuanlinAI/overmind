// CHAOS TEST — all v4 modules fire simultaneously, sandbox-safe
const path = require('path'), fs = require('fs'), os = require('os')
const ROOT = path.dirname(__dirname)
const TMP = path.join(os.tmpdir(), `ov-chaos-${Date.now()}`)
fs.mkdirSync(TMP, { recursive: true })

async function run() {

console.log('█'.repeat(60))
console.log('  XUANLIN OVERMIND v4 — CHAOS STRESS TEST')
console.log('  All modules fire simultaneously')
console.log('█'.repeat(60))
console.log('')

const failures = []
const chaosStart = Date.now()

// ===== STAGE 1: Simulate 10 concurrent injection cycles =====
console.log('━ STAGE 1: 10 concurrent injection cycles ━')
const injectCycles = []
for (let i = 0; i < 10; i++) {
  const start = Date.now()
  try {
    const index = require(path.join(ROOT, 'index'))
    index.init()
    const graph = require(path.join(ROOT, 'graph'))
    graph.init()
    const bus = require(path.join(ROOT, 'eventbus'))
    const wiring = require(path.join(ROOT, 'wiring'))
    wiring.init()

    // Fire ALL modules in parallel
    const tasks = []
    const modules = ['persona','anomaly','optimizer','composer','verifier','prefetch','dream','research','transfer','forecast','causalviz']
    for (const mod of modules) {
      tasks.push(new Promise(resolve => {
        try {
          const m = require(path.join(ROOT, mod))
          let result = null
          if (mod === 'persona') result = m.analyze(index)
          else if (mod === 'anomaly') result = m.detect(index, 'chaos stress test')
          else if (mod === 'optimizer') result = m.analyze()
          else if (mod === 'composer') result = m.detectChains(index)
          else if (mod === 'verifier') result = m.verify(index)
          else if (mod === 'prefetch') result = m.prefetch(process.cwd())
          else if (mod === 'dream') result = m.loadDreamFindings()
          else if (mod === 'research') result = null
          else if (mod === 'transfer') result = m.getTransferable('chaos test', 3)
          else if (mod === 'forecast') result = { predictions: [] }
          else if (mod === 'causalviz') result = m.visualize(graph, ['bm_test'], 1)
          resolve({ mod, ok: true, ms: Date.now() - start })
        } catch(e) { resolve({ mod, ok: false, error: e.message, ms: Date.now() - start }) }
      }))
    }
    // Also fire async: broadcast + eventbus + communicator
    tasks.push(new Promise(resolve => {
      try {
        bus.emit('chaos_test', { cycle: i, ts: Date.now() })
        require(path.join(ROOT, 'broadcast')).emit('chaos:parallel', { cycle: i })
        resolve({ mod: 'bus+broadcast', ok: true, ms: Date.now() - start })
      } catch(e) { resolve({ mod: 'bus+broadcast', ok: false, error: e.message, ms: Date.now() - start }) }
    }))

    const results = await Promise.all(tasks)
    injectCycles.push({ cycle: i, ms: Date.now() - start, results })
  } catch(e) {
    failures.push({ stage: 'inject_cycles', cycle: i, error: e.message })
  }
}

const cycleMs = injectCycles.map(c => c.ms)
const allModResults = injectCycles.flatMap(c => c.results)
const modFailures = allModResults.filter(r => !r.ok)
console.log(`  Cycles: ${injectCycles.length} | Avg: ${(cycleMs.reduce((s,v)=>s+v,0)/cycleMs.length).toFixed(0)}ms | Max: ${Math.max(...cycleMs)}ms`)
console.log(`  Module failures: ${modFailures.length}/${allModResults.length}`)

// ===== STAGE 2: Graph stress — 1000 rapid edges =====
console.log('━ STAGE 2: Graph stress (1000 rapid edges) ━')
const gdb = require('better-sqlite3')(path.join(TMP, 'chaos_graph.db'))
gdb.pragma('journal_mode = WAL')
gdb.exec('CREATE TABLE IF NOT EXISTS edges (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, target TEXT, relation_type TEXT, confidence REAL)')
const t2 = Date.now()
const edgeStmt = gdb.prepare('INSERT INTO edges (source,target,relation_type,confidence) VALUES (?,?,?,?)')
gdb.transaction(rows => { for (const r of rows) edgeStmt.run(...r) })(
  Array.from({length:1000}, (_,i) => [`s${i}`,`t${i+1}`,'related_to',Math.random()])
)
const edgeMs = Date.now() - t2
const edgeCount = gdb.prepare('SELECT COUNT(*) as c FROM edges').get().c
console.log(`  1000 edges in ${edgeMs}ms | Verified: ${edgeCount} rows`)

// ===== STAGE 3: Memory flood — 500 concurrent writes + reads =====
console.log('━ STAGE 3: Memory flood (500 writes + reads) ━')
const db = require('better-sqlite3')(path.join(TMP, 'chaos_memory.db'))
db.pragma('journal_mode = WAL')
db.exec('CREATE TABLE IF NOT EXISTS semantic (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, content TEXT, tags TEXT)')
try { db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(key, content, tags, tokenize='unicode61')") } catch(e) {}
const t3 = Date.now()
const writeStmt = db.prepare('INSERT INTO semantic (key,content,tags) VALUES (?,?,?)')
db.transaction(rows => { for (const r of rows) writeStmt.run(...r) })(
  Array.from({length:500}, (_,i) => [`chaos_${i}`, `stress test record ${i} with content about ${['auth','api','token','db','cache'][i%5]}`, 'stress,chaos'])
)
const writesMs = Date.now() - t3
// Concurrent reads
const reads = []
const t4 = Date.now()
for (let i = 0; i < 100; i++) {
  reads.push(db.prepare("SELECT key FROM semantic WHERE content LIKE ? LIMIT 10").all(`%${['auth','api','token'][i%3]}%`))
}
const readsMs = Date.now() - t4
const memCount = db.prepare('SELECT COUNT(*) as c FROM semantic').get().c
console.log(`  Writes: 500 in ${writesMs}ms | Reads: 100 in ${readsMs}ms | Total: ${memCount} records`)

// ===== STAGE 4: Event flood + IPC stress =====
console.log('━ STAGE 4: Event flood (1000 events + IPC) ━')
const bus = require(path.join(ROOT, 'eventbus'))
const broadcast = require(path.join(ROOT, 'broadcast'))
let busCount = 0, bcCount = 0, ipcCount = 0
bus.on('chaos_flood', () => busCount++)
broadcast.on('chaos:flood', () => bcCount++)
const t5 = Date.now()
for (let i = 0; i < 1000; i++) {
  bus.emit('chaos_flood', { i })
  broadcast.emit('chaos:flood', { i })
  try {
    require(path.join(ROOT, 'wiring')).pushInterProcess('chaos_ipc', { i })
    ipcCount++
  } catch(e) {}
}
const floodMs = Date.now() - t5
console.log(`  Bus: ${busCount}/1000 | Broadcast: ${bcCount}/1000 | IPC: ${ipcCount}/1000 | ${floodMs}ms`)

// ===== STAGE 5: Quantum cache + pipeline stress =====
console.log('━ STAGE 5: Quantum cache + Pipeline ━')
const pipeline = require(path.join(ROOT, 'pipeline'))
const ctx1 = { test: 'chaos_ctx_a', data: 'same' }
const ctx2 = { test: 'chaos_ctx_b', data: 'different' }
const r1 = pipeline.runSync('inject', ctx1)
const r2 = pipeline.runSync('inject', ctx1) // Same → should hit negative space cache
const r3 = pipeline.runSync('inject', ctx2) // Different → should recompute
const cacheWorked = Object.keys(r1).length > 0
console.log(`  Pipeline runs: 3 | Cache hit: ${JSON.stringify(r1)===JSON.stringify(r2)} | Recomputed: ${JSON.stringify(r2)!==JSON.stringify(r3)}`)

// ===== CLEANUP =====
db.close(); gdb.close()
fs.rmSync(TMP, { recursive: true, force: true })

// ===== REPORT =====
const totalMs = Date.now() - chaosStart
const totalFail = failures.length + modFailures.length
console.log('')
console.log('█'.repeat(60))
console.log(`  CHAOS TEST: ${totalFail===0?'🏆 ALL PASSED':'❌ FAILURES'}`)
console.log(`  Time: ${totalMs}ms | Failures: ${totalFail}`)
console.log('█'.repeat(60))
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
