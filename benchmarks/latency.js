// Benchmark 4: Injection Latency (lite→full)
// Parses inject.log for lite→full time deltas, outputs p50/p95/p99
const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__dirname)

console.log('=== Injection Latency Benchmark ===')
const logFile = path.join(ROOT, 'inject.log')
if (!fs.existsSync(logFile)) { console.log(JSON.stringify({error:'no inject.log'})); process.exit(0) }

const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean)

const deltas = []
let lastLiteTs = null

for (const l of lines) {
  const liteMatch = l.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z).*inject\(lite\)/)
  const fullMatch = l.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z).*inject\(full\)/)

  if (liteMatch) lastLiteTs = new Date(liteMatch[1]).getTime()
  if (fullMatch && lastLiteTs) {
    const delta = new Date(fullMatch[1]).getTime() - lastLiteTs
    if (delta > 0 && delta < 120000) { // Ignore outliers > 2min
      deltas.push(delta)
    }
  }
}

if (deltas.length < 3) { console.log(JSON.stringify({error:'<3 samples'})); process.exit(0) }

deltas.sort((a,b) => a-b)
const p50 = (deltas[Math.floor(deltas.length * 0.50)] / 1000).toFixed(1)
const p95 = (deltas[Math.floor(deltas.length * 0.95)] / 1000).toFixed(1)
const p99 = (deltas[Math.floor(deltas.length * 0.99)] / 1000).toFixed(1)
const avg = (deltas.reduce((s,v) => s+v, 0) / deltas.length / 1000).toFixed(1)

const report = {
  benchmark: 'injection_latency',
  samples: deltas.length,
  avg_seconds: avg,
  p50_seconds: p50,
  p95_seconds: p95,
  p99_seconds: p99,
  verdict: parseFloat(p95) < 60 ? 'PASS' : 'FAIL'
}

console.log(JSON.stringify(report, null, 2))
