// Master Runner — runs ALL benchmark suites, aggregates results
const { spawnSync } = require('child_process')
const path = require('path'), fs = require('fs')

const SUITES = [
  { name:'memory_supremacy', file:'memory_supremacy.js' },
  { name:'causal_reasoning', file:'causal_reasoning.js' },
  { name:'evolution_longitudinal', file:'evolution_longitudinal.js' },
  { name:'predictive_debug', file:'predictive_debug.js' },
  { name:'skill_composition', file:'skill_composition.js' },
  { name:'event_bus', file:'event_bus.js' },
  { name:'semantic_fidelity', file:'semantic_fidelity.js' },
  { name:'adversarial', file:'adversarial.js' },
]

const REPORTS_DIR = path.join(__dirname, 'reports')
fs.mkdirSync(REPORTS_DIR, { recursive: true })

console.log('█'.repeat(60))
console.log('  XUANLIN OVERMIND v4 — COMPLETE BENCHMARK')
console.log('█'.repeat(60))
console.log('')

const results = []
const totalStart = Date.now()

for (const suite of SUITES) {
  const filepath = path.join(__dirname, 'suites', suite.file)
  if (!fs.existsSync(filepath)) {
    results.push({ name:suite.name, status:'missing' })
    console.log(`  ✗ ${suite.name}: FILE NOT FOUND`)
    continue
  }
  const reportPath = path.join(REPORTS_DIR, `${suite.name}.json`)
  const start = Date.now()
  process.stdout.write(`  → ${suite.name}... `)
  const r = spawnSync(process.execPath, [filepath], { env: {...process.env, BENCH_REPORT_PATH: reportPath}, encoding:'utf8', timeout: 120000 })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  let report = null
  if (fs.existsSync(reportPath)) {
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) } catch(e) {}
  }

  const status = r.status === 0 ? 'PASS' : 'FAIL'
  results.push({ name:suite.name, status, elapsed:elapsed+'s', headline: report?.headline || {} })
  console.log(`${status} (${elapsed}s)`)
}

const totalS = ((Date.now() - totalStart) / 1000).toFixed(1)
const passed = results.filter(r=>r.status==='PASS'||r.status==='missing').length
const failed = results.filter(r=>r.status==='FAIL').length

console.log('')
console.log('█'.repeat(60))
console.log(`  ${passed}/${results.length} SUITES  |  ${totalS}s total`)
console.log('█'.repeat(60))
console.log('')
results.forEach(r => console.log(`  ${r.status==='PASS'?'✓':'✗'} ${r.name.padEnd(30)} ${r.elapsed||'N/A'}  ${r.headline.verdict||''} ${Object.values(r.headline)[0]||''}`))

// Aggregate JSON
const agg = { timestamp: new Date().toISOString(), total_seconds: totalS, passed, failed, results }
fs.writeFileSync(path.join(REPORTS_DIR, '_summary.json'), JSON.stringify(agg, null, 2))
console.log(`\n📄 Summary: ${path.join(REPORTS_DIR, '_summary.json')}`)
process.exit(failed > 0 ? 1 : 0)
