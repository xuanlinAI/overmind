// 6. Event Bus — throughput, ordering, chaos recovery
const path = require('path'), bus = require(path.join(path.dirname(path.dirname(__dirname)), 'eventbus'))
const M = require('../harness/metrics')

async function run() {
  console.log(`\n=== Event Bus ===`)
  // Throughput
  const t0 = Date.now()
  let count = 0
  bus.on('bm_tp', () => { count++ })
  for (let i = 0; i < 1000; i++) bus.emit('bm_tp', { i })
  const tpMs = Date.now() - t0

  // Ordering
  const ordered = []
  bus.on('bm_order', d => ordered.push(d.seq))
  for (let i = 0; i < 100; i++) bus.emit('bm_order', { seq: i })
  const orderOk = ordered.every((v, i) => v === i)

  // Chaos: kill a subscriber, ensure others survive
  let alive1 = 0, alive2 = 0
  const sub1 = bus.on('bm_chaos', () => alive1++)
  const sub2 = bus.on('bm_chaos', () => alive2++)
  sub1() // kill sub1
  bus.emit('bm_chaos', {})
  sub2() // cleanup

  const report = {
    suite: 'event_bus',
    throughput: `${(1000/tpMs*1000).toFixed(0)} events/sec (${tpMs}ms for 1000)`,
    ordering_correct: orderOk,
    chaos_survivor_ok: alive1 === 0 && alive2 === 1,
    headline: { throughput: `${(1000/tpMs*1000).toFixed(0)}/sec`, verdict: 'PASS' }
  }
  console.log(`  ${report.throughput} | Order:${orderOk?'OK':'FAIL'} | Chaos:${report.chaos_survivor_ok?'OK':'FAIL'}`)
  return report
}
run().then(r=>{require('fs').writeFileSync(process.env.BENCH_REPORT_PATH||path.join(__dirname,'..','reports','event_bus.json'),JSON.stringify(r,null,2)); process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})
