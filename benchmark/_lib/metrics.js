// Benchmark metrics collector
const now = () => process.hrtime.bigint ? Number(process.hrtime.bigint() / 1000000n) : Date.now();

class Metrics {
  constructor() {
    this.samples = [];
    this.errors = 0;
    this.startTime = now();
  }
  record(durationMs, error = false) { this.samples.push(durationMs); if (error) this.errors++; }
  summary() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const n = sorted.length;
    return {
      count: n, errors: this.errors,
      min: sorted[0] || 0, max: sorted[n - 1] || 0,
      avg: n ? Math.round(sorted.reduce((a, b) => a + b, 0) / n) : 0,
      p50: sorted[Math.floor(n * 0.5)] || 0,
      p95: sorted[Math.floor(n * 0.95)] || 0,
      p99: sorted[Math.floor(n * 0.99)] || 0,
      throughput: n ? Math.round(n / ((now() - this.startTime) / 1000)) : 0,
    };
  }
}

module.exports = { Metrics, now };
