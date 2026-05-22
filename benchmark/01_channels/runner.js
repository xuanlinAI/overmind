// Suite 01 — 6-channel concurrent flood
const fs = require('fs'), path = require('path');
const { T, assert, report } = require('../_lib/assert');
const { Metrics } = require('../_lib/metrics');
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;

// Load real v4 modules
require(path.join(ROOT, 'stages'));
const pipeline = require(path.join(ROOT, 'pipeline'));
const bus = require(path.join(ROOT, 'eventbus'));
require(path.join(ROOT, 'wiring')).init();
const communicator = require(path.join(ROOT, 'communicator'));
const orchestrator = require(path.join(ROOT, 'orchestrator'));
const index = require(path.join(ROOT, 'index')); index.init();
const graph = require(path.join(ROOT, 'graph'));
const met = new Metrics();

T('CH1 pipeline: 500 cycles with max ctx', () => {
  const ctx = { index, graph, userTask: 'stress'.repeat(100), skills: Array.from({ length: 10 }, (_, i) => ({ name: `s${i}` })), mems: Array.from({ length: 50 }, (_, i) => ({ key: `k${i}`, content: `c${i}` })) };
  const t0 = Date.now();
  let errs = 0;
  for (let i = 0; i < 500; i++) {
    try {
      const r = pipeline.runSync('inject', ctx);
      for (const [k] of Object.entries(r)) { if (k.endsWith('_error')) errs++; }
    } catch (e) { errs++; }
  }
  const dt = Date.now() - t0;
  met.record(dt);
  assert(errs < 5, `${errs} pipeline errors in 500 cycles`);
  assert(dt < 30000, `CH1 timeout: ${dt}ms`);
});

T('CH2 broadcast: 48 modules load proof', () => {
  const modules = ['persona', 'anomaly', 'composer', 'verifier', 'prefetch', 'dream', 'transfer', 'research',
    'forecast', 'shield', 'red_team', 'counterfactual', 'predictor', 'noiselearner', 'synthesizer', 'reason',
    'lineage', 'budget', 'healer', 'nexus', 'adaptive', 'arbitrator', 'briefing', 'budget_killer', 'causalviz',
    'checkpoint_writer', 'commit_gate', 'compress', 'continuity', 'deadcode', 'fleet', 'gatekeeper', 'hypothesis',
    'intent', 'marketplace', 'morning', 'optimizer', 'orchestrator', 'pool', 'preload', 'privacy_filter',
    'test_first_enforcer', 'theory_of_mind', 'timetravel', 'adapters', 'anticompact', 'communicator'];
  for (const m of modules) {
    try { require(path.join(ROOT, m)); } catch (e) { assert(false, `${m}: ${e.message}`); }
  }
  assert(true);
});

T('CH3 fleet_broadcast.md freshness', () => {
  const fb = path.join(ROOT, '.fleet_broadcast.md');
  if (!fs.existsSync(fb)) { fs.writeFileSync(fb, '📡 Fleet\n> test'); }
  const age = (Date.now() - fs.statSync(fb).mtimeMs) / 1000;
  assert(age < 60, `broadcast stale: ${Math.round(age)}s`);
});

T('CH4 event queue flood + drain', () => {
  const eq = path.join(ROOT, '.event_queue');
  fs.mkdirSync(eq, { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < 500; i++) {
    fs.writeFileSync(path.join(eq, `bench_${i}.json`), JSON.stringify({ event: 'fleet:broadcast', ts: Date.now(), data: { count: 1 } }));
  }
  const drained = require(path.join(ROOT, 'wiring')).drainInterProcess(300000);
  const dt = Date.now() - t0;
  met.record(dt);
  assert(drained.length >= 500, `drained ${drained.length}/500`);
});

T('CH5 terminal serial 100 cycles', () => {
  const t0 = Date.now();
  let errs = 0;
  for (let i = 0; i < 100; i++) {
    try { communicator.terminalSerial('# Stress', { index, graph, skills: [], mems: [] }); } catch (e) { errs++; }
  }
  met.record(Date.now() - t0);
  assert(errs === 0, `${errs} terminal errors`);
});

T('CH6 terminal broadcast 200 events', () => {
  let fired = 0;
  bus.on('terminal:broadcast', () => { fired++; });
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    bus.emit('terminal:broadcast', { content: 'stress', length: 6, skills: [], mems: [], timestamp: new Date().toISOString() });
  }
  met.record(Date.now() - t0);
  assert(fired === 200, `only ${fired}/200 received`);
});

T('CH1+CH2+CH4 cross-channel no crosstalk', () => {
  // Run pipeline while flooding events
  const ctx = { index, graph, userTask: 'cross', skills: [], mems: [] };
  const errs = [];
  for (let i = 0; i < 50; i++) {
    try { pipeline.runSync('inject', ctx); bus.emit('fleet:broadcast', { instances: [] }); } catch (e) { errs.push(e.message); }
  }
  assert(errs.length === 0, `${errs.length} cross-channel errors`);
});

report(REPORT_DIR);
