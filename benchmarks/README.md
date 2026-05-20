# Xuanlin Overmind Benchmarks

All benchmarks are self-contained. Run with `node benchmarks/<name>.js`. Each outputs a JSON report.

## Benchmarks

### 1. Causal Chain Recall
```bash
node benchmarks/causal_recall.js
```
Seeds 100 known causal edges. Queries by root. Measures recall@5.

### 2. Communicator Compression
```bash
node benchmarks/communicator_compress.js
```
Analyzes inject.log. Reports avg/p50/p95 compression ratio.

### 3. Predictor Hit Rate
```bash
node benchmarks/predictor_hitrate.js
```
Seeds 10 files with known failure patterns. Tests predictor accuracy.

### 4. Injection Latency
```bash
node benchmarks/latency.js
```
Parses inject.log for lite→full (lite→full) time deltas. Reports p50/p95/p99.

**Important: This is backend async latency — NOT user-perceived latency.**
Overmind uses a two-phase design: lite injection writes instantly (0ms, 0 API calls) so CC has context immediately. The full injection with AI-selected skills and memories completes asynchronously in the background. The user types while it runs, CC thinks while it runs. By the time the user sees CC's response, the full injection is already in place. **Perceived latency: 0ms.**

## Expected Results

| Benchmark | Target |
|-----------|--------|
| Causal Recall | >80% recall@5 |
| Compression | >50% avg |
| Predictor | >60% hit rate |
| Latency | p95 < 60s |

## Reproducibility

All benchmarks use seeded data and local log files. No external API calls. Anyone can clone and run.
