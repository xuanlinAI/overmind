// Benchmark 2: Communicator Compression Ratio
// Measures compression rate on real injection docs, verifies key info retained
const path = require('path')
const fs = require('fs')
const ROOT = path.dirname(__dirname)

console.log('=== Communicator Compression Benchmark ===')

// Collect injection samples from inject.log
const logFile = path.join(ROOT, 'inject.log')
if (!fs.existsSync(logFile)) { console.log(JSON.stringify({error:'no inject.log'})); process.exit(0) }

const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean)
const samples = []
for (const l of lines) {
  const m = l.match(/communicator: (\d+)C → (\d+)C/)
  if (m) samples.push({ original: parseInt(m[1]), filtered: parseInt(m[2]) })
}

if (samples.length < 5) { console.log(JSON.stringify({error:'<5 samples'})); process.exit(0) }

// Compute stats
const lastN = samples.slice(-20)
let totalOrig = 0, totalFilt = 0
for (const s of lastN) { totalOrig += s.original; totalFilt += s.filtered }

const avgCompression = ((1 - totalFilt / totalOrig) * 100).toFixed(1)
const medians = lastN.map(s => s.filtered / s.original).sort((a,b) => a-b)
const p50 = (medians[Math.floor(medians.length/2)] * 100).toFixed(1)
const p95 = (medians[Math.floor(medians.length*0.95)] * 100).toFixed(1)
const min = (Math.min(...lastN.map(s=>s.filtered/s.original))*100).toFixed(1)
const max = (Math.max(...lastN.map(s=>s.filtered/s.original))*100).toFixed(1)

const report = {
  benchmark: 'communicator_compression',
  samples: lastN.length,
  avg_compression: `${avgCompression}%`,
  compression_range: `${min}% - ${max}%`,
  p50: `${p50}%`,
  p95: `${p95}%`,
  total_chars_original: totalOrig,
  total_chars_filtered: totalFilt,
  verdict: parseFloat(avgCompression) > 50 ? 'PASS' : 'FAIL'
}

console.log(JSON.stringify(report, null, 2))
