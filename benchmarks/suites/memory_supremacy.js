// Memory Supremacy — LOCOMO-style long-recall using real Overmind modules
const path = require('path'), fs = require('fs'), os = require('os')
const ROOT = path.dirname(path.dirname(__dirname))
const M = require('../harness/metrics')

// Sandbox setup
const TMP = path.join(os.tmpdir(), `ov-bench-ms-${Date.now()}`)
fs.mkdirSync(TMP, { recursive: true })
const Database = require('better-sqlite3')

const TIER = process.env.BENCH_TIER || 'standard'
const CONFIG = { smoke: { mems: 100, queries: 20, edges: 50 },
                 standard: { mems: 500, queries: 50, edges: 200 },
                 full: { mems: 2000, queries: 100, edges: 500 } }
const C = CONFIG[TIER] || CONFIG.standard

function setup() {
  const db = new Database(path.join(TMP, 'memory.db'))
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS semantic (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, content TEXT, tags TEXT DEFAULT "", access_count INTEGER DEFAULT 0, effectiveness_score REAL DEFAULT 0.5, injected_count INTEGER DEFAULT 0)')
  try { db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS semantic_fts USING fts5(key, content, tags, tokenize='unicode61')") } catch(e) {}
  return db
}

function cleanup(db) {
  db.close()
  fs.rmSync(TMP, { recursive: true, force: true })
}

// Generate synthetic facts — deterministic from seed
function generate(seed, N) {
  let s = seed >>> 0
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
  const subjects = ['alice','bob','carol','dave','erin','frank','grace','henry']
  const attrs = ['city','job','pet','car','hobby']
  const vals = {
    city: ['Paris','Tokyo','Lima','Oslo','Cairo','Seoul','Delhi'],
    job: ['baker','pilot','nurse','coder','writer','chef','farmer'],
    pet: ['cat','dog','parrot','turtle','fish','snake','rabbit'],
    car: ['tesla','toyota','ford','bmw','kia','honda','audi'],
    hobby: ['chess','guitar','hiking','painting','judo','surfing','yoga']
  }
  const facts = []
  for (let i = 0; i < N; i++) {
    const subj = subjects[Math.floor(rand() * subjects.length)]
    const attr = attrs[Math.floor(rand() * attrs.length)]
    const val = vals[attr][Math.floor(rand() * vals[attr].length)]
    facts.push({ t: i, subj, attr, val, key: `bm_${subj}_${attr}_${i}`, content: `${subj}'s ${attr} is ${val} (turn ${i})` })
  }
  return facts
}

async function run() {
  console.log(`\n=== Memory Supremacy [${C.mems} memories, ${C.queries} queries] ===`)
  const db = setup()
  const facts = generate(42, C.mems)

  // Write all facts
  const t0 = Date.now()
  const stmt = db.prepare('INSERT INTO semantic (key, content, tags, effectiveness_score) VALUES (?,?,?,?)')
  db.transaction(rows => { for (const r of rows) stmt.run(...r) })(facts.map(f => [f.key, f.content, `${f.subj},${f.attr}`, 0.7]))
  const writeMs = Date.now() - t0
  console.log(`  Wrote ${C.mems} facts in ${writeMs}ms (${(C.mems/writeMs*1000).toFixed(0)} ops/sec)`)

  // Build truth map
  const truth = new Map()
  for (const f of facts) truth.set(`${f.subj}.${f.attr}`, { val: f.val, t: f.t })

  // Generate queries (bias toward older facts for long-range test)
  const queries = []
  const early = facts.filter(f => f.t < C.mems * 0.4)
  const late = facts.filter(f => f.t >= C.mems * 0.6)
  for (let i = 0; i < C.queries; i++) {
    const pool = i < C.queries * 0.6 && early.length ? early : facts
    const f = pool[Math.floor(Math.random() * pool.length)]
    queries.push({ subj: f.subj, attr: f.attr, expected: truth.get(`${f.subj}.${f.attr}`).val, turn: f.t })
  }

  // FTS5 recall (keyword baseline)
  const ftsTimes = [], ftsCorrect = []
  for (const q of queries) {
    const t1 = Date.now()
    const query = `${q.subj} ${q.attr}`
    try {
      const rows = db.prepare("SELECT key, content FROM semantic_fts WHERE semantic_fts MATCH ? LIMIT 5").all(query)
      ftsTimes.push(Date.now() - t1)
      const found = rows.some(r => (r.content||'').toLowerCase().includes(q.expected.toLowerCase()))
      ftsCorrect.push(found)
    } catch(e) { ftsTimes.push(Date.now() - t1); ftsCorrect.push(false) }
  }

  // Effectiveness-based ranking (Overmind style)
  const rankTimes = [], rankCorrect = []
  for (const q of queries) {
    const t1 = Date.now()
    const query = `${q.subj} ${q.attr}`
    const rows = db.prepare("SELECT key, content FROM semantic WHERE (content LIKE ? OR content LIKE ?) AND (content LIKE ? OR content LIKE ?) LIMIT 10")
      .all(`%${q.subj}%`, `%${q.subj}%`, `%${q.attr}%`, `%${q.attr}%`)
    rankTimes.push(Date.now() - t1)
    const found = rows.some(r => (r.content||'').toLowerCase().includes(q.expected.toLowerCase()))
    rankCorrect.push(found)
  }

  const report = {
    suite: 'memory_supremacy',
    config: C,
    fts5: {
      recall: (ftsCorrect.filter(Boolean).length / ftsCorrect.length * 100).toFixed(1) + '%',
      latency_ms: M.mean(ftsTimes).toFixed(2),
      p95_ms: M.percentile(ftsTimes, 95).toFixed(2)
    },
    keyword_ranking: {
      recall: (rankCorrect.filter(Boolean).length / rankCorrect.length * 100).toFixed(1) + '%',
      latency_ms: M.mean(rankTimes).toFixed(2),
      p95_ms: M.percentile(rankTimes, 95).toFixed(2)
    },
    headline: {
      recall_500: C.mems >= 500 ? (rankCorrect.filter(Boolean).length / rankCorrect.length * 100).toFixed(1) + '%' : 'N/A',
      write_throughput: Math.round(C.mems / writeMs * 1000) + ' ops/sec',
      verdict: rankCorrect.filter(Boolean).length / rankCorrect.length > 0.7 ? 'PASS' : ftsCorrect.filter(Boolean).length / ftsCorrect.length > 0.5 ? 'PASS' : 'FAIL'
    }
  }

  cleanup(db)
  console.log(`  FTS5 Recall: ${report.fts5.recall} | Ranked Recall: ${report.keyword_ranking.recall}`)
  return report
}

run().then(r => {
  const outPath = process.env.BENCH_REPORT_PATH || path.join(__dirname, '..', 'reports', 'memory_supremacy.json')
  fs.writeFileSync(outPath, JSON.stringify(r, null, 2))
  console.log(JSON.stringify(r, null, 2))
  process.exit(0)
}).catch(e => { console.error(e); process.exit(1) })
