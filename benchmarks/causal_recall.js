// Benchmark 1: Causal Chain Recall
// Seeds 100 known causal edges, queries by root, measures recall@5
const path = require('path')
const ROOT = path.dirname(__dirname)

console.log('=== Causal Recall Benchmark ===')
const index = require(path.join(ROOT, 'index'))
const graph = require(path.join(ROOT, 'graph'))
index.init()
graph.init()

// Seed 20 root keys with 5 known causal edges each = 100 edges
const roots = []
for (let i = 1; i <= 20; i++) {
  const root = `bm_root_${i}`
  roots.push(root)
  for (let j = 1; j <= 5; j++) {
    const type = j <= 2 ? 'blocked_by' : j <= 4 ? 'causes' : 'depends_on'
    const target = `bm_target_${i}_${j}`
    graph.upsertEdge(root, target, type, 0.7 + j * 0.05, `bm_evidence_${i}_${j}`, 'benchmark')
    // Set failure_rate for causes edges
    if (type === 'causes') {
      try {
        const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
        gdb.prepare('UPDATE edges SET exposure_count=10, outcome_count=?, failure_rate=? WHERE source=? AND target=?')
          .run(5 - (j-3), Math.round((1-(5-(j-3))/10)*100)/100, root, target)
        gdb.close()
      } catch(e) {}
    }
  }
}

// Query each root and measure recall
let totalExpected = 0, totalFound = 0, top5Hits = 0

for (const root of roots) {
  const chain = graph.getCausalChain(root, 2)
  const found = chain.chains.length
  // Each root has 5 edges: 2 blocked_by + 2 causes + 1 depends_on
  totalExpected += 5
  totalFound += found

  // top-5 recall: if first 5 edges contain at least 3 known ones
  const foundNames = new Set(chain.chains.map(c => c.to))
  let hits = 0
  for (let j = 1; j <= 5; j++) { if (foundNames.has(`bm_target_${root.split('_').pop()}_${j}`)) hits++ }
  if (hits >= 3) top5Hits++
}

const recall = (totalFound / totalExpected * 100).toFixed(1)
const top5Rate = (top5Hits / roots.length * 100).toFixed(1)

const report = {
  benchmark: 'causal_recall',
  total_edges_seeded: 100,
  total_roots: 20,
  total_expected: totalExpected,
  total_found: totalFound,
  recall: `${recall}%`,
  top5_precision: `${top5Rate}%`,
  verdict: recall >= 80 ? 'PASS' : 'FAIL'
}

console.log(JSON.stringify(report, null, 2))

// Cleanup
const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
for (const root of roots) {
  db.prepare('DELETE FROM semantic WHERE key LIKE ?').run(`bm_%`)
}
db.close()
const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
gdb.prepare('DELETE FROM edges WHERE source LIKE ? OR target LIKE ?').run('bm_%', 'bm_%')
gdb.close()
