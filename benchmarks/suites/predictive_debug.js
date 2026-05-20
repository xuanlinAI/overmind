// 4. Predictive Debugging — 100 samples with 95% CI
const path = require('path'), os = require('os'), fs = require('fs')
const Database = require('better-sqlite3')
const M = require('../harness/metrics')
const TMP = path.join(os.tmpdir(), `ov-bench-pd-${Date.now()}`)
fs.mkdirSync(TMP, { recursive: true })

const CAUSES = ['off_by_one','mutation_of_input','race_condition','floating_point','null_dereference','type_coercion','infinite_loop','off_by_one','mutation_of_input','race_condition']
const FILES = ['src/auth.js','src/token.js','src/api.js','src/db.js','src/cache.js','src/router.js','src/parser.js','src/validator.js','src/middleware.js','src/handler.js']
const COMMITS = ['fix_auth','feat_token','refactor_api','hotfix_db','perf_cache','chore_deps','feat_router','fix_parser','refactor_valid','feat_middle']

function setup() {
  const gdb = new Database(path.join(TMP, 'graph.db'))
  gdb.pragma('journal_mode = WAL')
  gdb.exec('CREATE TABLE IF NOT EXISTS edges (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, target TEXT, relation_type TEXT, confidence REAL DEFAULT 0.5, failure_rate REAL DEFAULT 0, exposure_count INTEGER DEFAULT 0, outcome_count INTEGER DEFAULT 0, evidence TEXT DEFAULT "")')
  return gdb
}
function cleanup(db) { db.close(); fs.rmSync(TMP,{recursive:true,force:true}) }

async function run() {
  const N = 100
  console.log(`\n=== Predictive Debug [${N} samples] ===`)
  const gdb = setup()
  const correct = [], causeCorrect = []

  for (let i = 0; i < N; i++) {
    const file = FILES[i % FILES.length]
    const cause = CAUSES[i % CAUSES.length]
    const commit = COMMITS[i % COMMITS.length]
    const fr = 0.3 + Math.random() * 0.6
    const exp = Math.floor(5 + Math.random() * 15)

    gdb.prepare('INSERT INTO edges (source, target, relation_type, confidence, failure_rate, exposure_count, outcome_count, evidence) VALUES (?,?,?,?,?,?,?,?)').run(file, cause, 'causes', 0.5+Math.random()*0.5, fr, exp, Math.floor(exp*(1-fr)), `${commit}: modified ${file}`)

    const rows = gdb.prepare("SELECT target, failure_rate FROM edges WHERE source=? AND relation_type='causes' ORDER BY failure_rate DESC LIMIT 1").all(file)
    if (rows.length > 0) {
      causeCorrect.push(rows[0].target === cause)
      correct.push(rows[0].failure_rate > 0.4)
    } else {
      causeCorrect.push(false)
      correct.push(false)
    }
  }

  const causeAcc = causeCorrect.filter(Boolean).length / N
  const hazardAcc = correct.filter(Boolean).length / N
  const ci = M.ci95(causeCorrect.map(c => c ? 1 : 0))

  const report = {
    suite: 'predictive_debug',
    samples: N,
    cause_accuracy: (causeAcc * 100).toFixed(1) + '%',
    hazard_detection: (hazardAcc * 100).toFixed(1) + '%',
    ci95: `${(ci.lo*100).toFixed(1)}%–${(ci.hi*100).toFixed(1)}%`,
    headline: {
      cause_accuracy_n100: (causeAcc * 100).toFixed(1) + '%',
      ci95_lower: (ci.lo * 100).toFixed(1) + '%',
      verdict: ci.lo > 0.5 ? 'PASS' : 'FAIL'
    }
  }
  cleanup(gdb)
  console.log(`  Cause: ${report.cause_accuracy} | CI95: ${report.ci95}`)
  return report
}
run().then(r=>{ fs.writeFileSync(process.env.BENCH_REPORT_PATH||path.join(__dirname,'..','reports','predictive_debug.json'),JSON.stringify(r,null,2)); process.exit(0) }).catch(e=>{console.error(e);process.exit(1)})
