// ULTIMATE Benchmark — 66 modules, 4 tiers, breaking point discovery
const path = require('path'), fs = require('fs'), os = require('os')
const ROOT = path.dirname(__dirname)
const REPORTS = path.join(__dirname, 'ultimate', 'reports')
const RAW = path.join(__dirname, 'ultimate', 'raw')
fs.mkdirSync(REPORTS, { recursive: true }); fs.mkdirSync(RAW, { recursive: true })

// All 66 modules classified by stress class
const MODULES = {
  A_MEMORY: ['index','pool','compress','budget','deadcode','timetravel','checkpoint_writer','apply_patch_mode'],
  B_REASONING: ['graph','causalviz','forecast','counterfactual','predictor','synthesizer','reason','clarify_threshold','hypothesis','red_team'],
  C_PERCEPTION: ['prefetch','continuity','anticompact','morning','briefing','transfer','gatekeeper'],
  D_PLANNING: ['pipeline','stages','registry','nexus','preload','intent'],
  E_COMM: ['eventbus','broadcast','wiring','worker_queue','fleet','orchestrator'],
  F_LEARNING: ['persona','theory_of_mind','composer','lineage','noiselearner','research','dream'],
  G_COORD: ['adaptive','healer','budget_killer','commit_gate','test_first_enforcer','marketplace'],
  H_SAFETY: ['shield','privacy_filter','verifier','anomaly','optimizer','gatekeeper','marketplace','communicator'],
  I_META: ['inject','consolidate','daemon','config','config_unified','template','util','seed_v3']
}

const ALL = Object.values(MODULES).flat().filter((v,i,a) => a.indexOf(v) === i)

function loadModule(name) {
  try { require(path.join(ROOT, name)); return true }
  catch(e) { return false }
}

function measure(fn, iterations) {
  const times = []; let errors = 0; const memStart = process.memoryUsage().rss
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint()
    try { fn(); times.push(Number(process.hrtime.bigint() - t0) / 1e6) }
    catch(e) { errors++; times.push(0) }
  }
  const memEnd = process.memoryUsage().rss
  return {
    iterations, errors,
    avg_ms: times.filter(t=>t>0).reduce((s,t)=>s+t,0) / Math.max(1, times.length),
    min_ms: Math.min(...times.filter(t=>t>0)),
    max_ms: Math.max(...times),
    p95_ms: times.filter(t=>t>0).sort((a,b)=>a-b)[Math.floor(times.length*0.95)] || 0,
    mem_delta_kb: Math.round((memEnd - memStart) / 1024),
    error_rate: (errors / iterations * 100).toFixed(1) + '%'
  }
}

// Progressive load tiers
const TIERS = { T1: 10, T2: 100, T3: 1000, T4: 'break' }

function runTier(mod, fn, tier) {
  if (tier === 'break') return findBreakPoint(mod, fn)
  return measure(fn, TIERS[tier])
}

function findBreakPoint(mod, fn) {
  // Doubling search to find N_break
  let n = 1000, lastOk = 1000
  // Phase 1: doubling until failure or 30s
  while (n < 100000) {
    const t0 = Date.now()
    try { for (let i = 0; i < n; i++) fn() } catch(e) { break }
    const elapsed = Date.now() - t0
    if (elapsed > 30000) break
    lastOk = n; n *= 2
  }
  // Phase 2: binary search for precision
  let lo = lastOk, hi = n
  while (hi - lo > lo * 0.1) {
    const mid = Math.floor((lo + hi) / 2)
    const t0 = Date.now()
    try { for (let i = 0; i < mid; i++) fn(); lo = mid } catch(e) { hi = mid }
    if (Date.now() - t0 > 30000) { hi = mid } else { lo = mid }
  }
  return { n_break: lo, failure_mode: n >= 100000 ? 'timeout_30s' : lo < lastOk ? 'error_at' + lo : 'memory_or_crash' }
}

// Run all
console.log('█'.repeat(70))
console.log('  XUANLIN OVERMIND v4 — ULTIMATE BENCHMARK')
console.log('  66 modules · 4 tiers · breaking point discovery')
console.log('█'.repeat(70))
console.log('')

const totalStart = Date.now()
const results = {}
let totalPassed = 0, totalFailed = 0, totalBreak = 0

for (const [cls, mods] of Object.entries(MODULES)) {
  console.log(`\n━ ${cls} ━`)
  for (const mod of mods) {
    const exists = loadModule(mod)
    if (!exists) { results[mod] = { status: 'MISSING' }; totalFailed++; console.log(`  ✗ ${mod}: FILE NOT FOUND`); continue }

    // Build test function based on module type
    const fn = buildTestFn(mod)
    if (!fn) { results[mod] = { status: 'NO_TEST_FN' }; console.log(`  - ${mod}: skipped (no test fn)`); continue }

    const modResult = { module: mod, class: cls, tiers: {} }
    let allOk = true

    for (const tier of ['T1','T2','T3']) {
      const r = runTier(mod, fn, tier)
      modResult.tiers[tier] = r
      if (r.error_rate !== '0.0%') allOk = false
      process.stdout.write('.')
    }

    // T4: breaking point
    const bp = runTier(mod, fn, 'break')
    modResult.tiers.T4 = bp
    modResult.breaking_point = bp.n_break
    totalBreak++
    console.log(` ${mod}: T1=${modResult.tiers.T1?.avg_ms?.toFixed(2)}ms T2=${modResult.tiers.T2?.avg_ms?.toFixed(2)}ms T3=${modResult.tiers.T3?.avg_ms?.toFixed(2)}ms N_break=${bp.n_break}`)

    // Save raw
    fs.writeFileSync(path.join(RAW, `${mod}.json`), JSON.stringify(modResult, null, 2))
    results[mod] = { status: allOk ? 'PASS' : 'DEGRADED', breakdown: bp.n_break }
    if (allOk) totalPassed++; else totalFailed++
  }
}

const _seq = { val: 0 }
function seq() { return ++_seq.val }

function buildTestFn(mod) {
  try {
    const m = require(path.join(ROOT, mod))
    const s = seq()
    const idx = require('./index'); idx.init()
    const g = require('./graph'); g.init()

    // Per-module tailored test functions
    const tailored = {
      index: () => { idx.saveSemantic(`bm_s_${s}`, `stress ${s}`, 'bench'); idx.searchHybrid('stress', 2) },
      graph: () => { const uid=`bm_g_${s}`; g.upsertEdge(uid, uid+'_t', 'related_to', 0.5); g.getNeighbors(uid, 1) },
      eventbus: () => { const b=require('./eventbus'); const h=()=>{}; b.on(`bm_ev_${s}`,h); b.emit(`bm_ev_${s}`,{s}); b.off(`bm_ev_${s}`,h) },
      broadcast: () => { const b=require('./broadcast'); const h=()=>{}; b.on(`bm_bc_${s}`,h); b.emit(`bm_bc_${s}`,{s}) },
      persona: () => { require('./persona').analyze(idx) },
      budget: () => { require('./budget').analyze(idx) },
      deadcode: () => { require('./deadcode').scan(idx) },
      gatekeeper: () => { require('./gatekeeper').scan(`test command ${s} rm -rf /tmp/test`) },
      research: () => { require('./research').analyze(idx) },
      transfer: () => { require('./transfer').getTransferable(`test query ${s}`, 3) },
      optimizer: () => { require('./optimizer').analyze() },
      composer: () => { require('./composer').detectChains(idx) },
      verifier: () => { require('./verifier').verify(idx) },
      prefetch: () => { require('./prefetch').prefetch(process.cwd(), 'test') },
      dream: () => { require('./dream').loadDreamFindings() },
      anomaly: () => { require('./anomaly').detect(idx, 'benchmark test') },
      checkpoint_writer: () => { require('./checkpoint_writer').snapshot(idx, g) },
      theory_of_mind: () => { require('./theory_of_mind').update(idx) },
      budget_killer: () => { require('./budget_killer').track(`task_${s}`, `test_cmd_${s}`) },
      counterfactual: () => { require('./counterfactual').checkDrift(g, idx) },
      orchestrator: () => { require('./orchestrator').heartbeat(`bench_${s}`) },
      morning: () => { require('./morning').generate() },
      briefing: () => { require('./briefing').generate(null, [], []) },
      healer: () => { require('./healer').checkWorker() },
      noiselearner: () => { require('./noiselearner').learn(idx) },
      timetravel: () => { require('./timetravel').travel(idx, '2026-05-01') },
      compress: () => { require('./compress').compress(idx, 2) },
      fleet: () => { require('./fleet').exportMemory ? true : false },
      marketplace: () => { require('./marketplace').publish ? true : false },
      clarify_threshold: () => { require('./clarify_threshold').check(`test query ${s}`, idx) },
      hypothesis: () => { require('./hypothesis').register(`test_hyp_${s}`, ['bench']) },
      red_team: () => { require('./red_team') },
      pipeline: () => { require('./pipeline').list('inject') },
      stages: () => { require('./stages') },
      intent: () => { require('./intent').predict(process.cwd()) },
      continuity: () => { require('./continuity').detect(idx, 'test', []) },
      synthesizer: () => { require('./synthesizer').synthesize(idx, g) },
      causalviz: () => { require('./causalviz').visualize(g, [`bm_g_${s}`], 1) },
      forecast: () => { require('./forecast').predict(g, [`bm_g_${s}`]) },
      predictor: () => { require('./predictor').predict(idx, g, process.cwd()) },
      reason: () => { require('./reason').explainSkills([{name:'test',score:1.0}], null, [], []) },
      lineage: () => { require('./lineage').trace(idx, 'lateral-jump') },
    }
    if (tailored[mod]) return tailored[mod]

    // Fallback: try common API patterns
    if (typeof m === 'function') return () => { try { m() } catch(e) {} }
    if (typeof m.analyze === 'function') return () => { m.analyze(idx) }
    if (typeof m.check === 'function') return () => { m.check() }
    if (typeof m.scan === 'function') return () => { m.scan(idx) }
    if (typeof m.run === 'function') return () => { m.run() }
    if (typeof m.init === 'function') return () => { m.init() }
    return () => { require(path.join(ROOT, mod)) }
  } catch(e) { return null }
}

// Summary
const totalMs = Date.now() - totalStart
console.log('')
console.log('█'.repeat(70))
console.log(`  ULTIMATE RESULT: ${totalPassed} PASS · ${totalFailed} FAIL · ${totalBreak} BREAK POINTS FOUND`)
console.log(`  Time: ${(totalMs/1000).toFixed(0)}s`)
console.log('█'.repeat(70))

// Save summary
const summary = { timestamp: new Date().toISOString(), total_seconds: totalMs/1000, passed: totalPassed, failed: totalFailed, breaking_points: totalBreak, results }
fs.writeFileSync(path.join(REPORTS, 'ultimate_summary.json'), JSON.stringify(summary, null, 2))
console.log(`\n📄 Report: ${path.join(REPORTS, 'ultimate_summary.json')}`)
