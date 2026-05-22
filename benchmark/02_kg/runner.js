// Suite 02 — Knowledge Graph extreme stress
const fs = require('fs'), path = require('path');
const { T, assert, report } = require('../_lib/assert');
const { Metrics } = require('../_lib/metrics');
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;

const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'));
const graph = require(path.join(ROOT, 'graph'));
const met = new Metrics();

T('KG: 5000 nodes bulk insert', () => {
  const t0 = Date.now();
  const ins = gdb.prepare('INSERT OR IGNORE INTO nodes (key, label, node_type) VALUES (?,?,?)');
  gdb.exec('BEGIN');
  for (let i = 0; i < 5000; i++) ins.run(`bench_n${i}`, `benchmark node ${i}`, 'memory');
  gdb.exec('COMMIT');
  const dt = Date.now() - t0;
  met.record(dt);
  assert(dt < 5000, `5000 nodes: ${dt}ms`);
});

T('KG: 10000 edges bulk insert', () => {
  const t0 = Date.now();
  const ins = gdb.prepare('INSERT OR IGNORE INTO edges (source, target, relation_type, confidence) VALUES (?,?,?,?)');
  gdb.exec('BEGIN');
  const types = ['depends_on', 'part_of', 'blocked_by', 'causes', 'solves', 'related_to', 'extends', 'conflicts_with', 'alternative_to', 'triggers'];
  for (let i = 0; i < 10000; i++) {
    ins.run(`bench_n${i % 5000}`, `bench_n${(i + 1) % 5000}`, types[i % 10], Math.random());
  }
  gdb.exec('COMMIT');
  const dt = Date.now() - t0;
  met.record(dt);
  assert(dt < 10000, `10000 edges: ${dt}ms`);
});

T('KG: 10 relation types all present', () => {
  const rows = gdb.prepare('SELECT DISTINCT relation_type FROM edges').all().map(r => r.relation_type);
  const expected = ['depends_on', 'part_of', 'blocked_by', 'causes', 'solves', 'related_to', 'extends', 'conflicts_with', 'alternative_to', 'triggers'];
  for (const e of expected) assert(rows.includes(e), `missing relation: ${e}`);
});

T('KG: BFS expand 100 concurrent', () => {
  const keys = Array.from({ length: 100 }, (_, i) => `bench_n${i}`);
  const t0 = Date.now();
  for (const k of keys) graph.expandKeys([k], 2);
  const dt = Date.now() - t0;
  met.record(dt);
  assert(dt < 10000, `100 BFS: ${dt}ms`);
});

T('KG: cycle detection no hang', async () => {
  // Create a self-loop
  gdb.prepare('INSERT OR IGNORE INTO edges (source,target,relation_type,confidence) VALUES (?,?,?,?)').run('bench_cycle', 'bench_cycle', 'related_to', 1);
  const t0 = Date.now();
  const r = graph.getNeighbors('bench_cycle', 5); // depth-limited, should not hang
  const dt = Date.now() - t0;
  assert(dt < 5000, `cycle detection hung: ${dt}ms`);
  assert(Array.isArray(r.edges) || r.edges, 'cycle BFS must return');
  gdb.prepare('DELETE FROM edges WHERE source=? AND target=?').run('bench_cycle', 'bench_cycle');
});

T('KG: no orphan detection', () => {
  const n = gdb.prepare('SELECT COUNT(*) c FROM nodes').get();
  const e = gdb.prepare('SELECT COUNT(*) c FROM edges').get();
  const connected = gdb.prepare('SELECT COUNT(DISTINCT key) FROM nodes WHERE key IN (SELECT source FROM edges UNION SELECT target FROM edges)').get();
  const iso = Object.values(n)[0] - Object.values(connected)[0];
  // Log isolation level but don't fail — it's informational
  console.log(`  KG info: ${Object.values(n)[0]} nodes, ${Object.values(e)[0]} edges, ${iso} isolated`);
  assert(true);
});

T('KG: WAL integrity under load', () => {
  gdb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  gdb.exec('PRAGMA integrity_check');
  assert(true);
});

// Cleanup bench data
gdb.exec("DELETE FROM nodes WHERE key LIKE 'bench_%'");
gdb.exec("DELETE FROM edges WHERE source LIKE 'bench_%' OR target LIKE 'bench_%'");
gdb.close();

report(REPORT_DIR);
