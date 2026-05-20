# Reproducing Xuanlin Overmind v4 Benchmarks

Anyone can verify our claims. One command, 3 minutes.

## Requirements

- Node.js 20+ (any OS)
- Git
- 4GB RAM minimum

## Steps

```bash
# 1. Clone
git clone https://github.com/xuanlinAI/overmind.git
cd overmind

# 2. Install (one dependency)
npm install

# 3. Run full benchmark suite
node benchmarks/run_all.js

# 4. Run chaos stress test (all 66 modules simultaneously)
node benchmarks/chaos_test.js
```

## Expected Output

```
✓ memory_supremacy      PASS  94.0%
✓ causal_reasoning      PASS  100% @ 5-hop
✓ evolution_longitudinal PASS  +100pp uplift
✓ predictive_debug      PASS  100% (n=100)
✓ skill_composition     PASS
✓ event_bus             PASS  1M/sec
✓ semantic_fidelity     PASS  >85%
✓ adversarial           PASS  5/5
```

## Hardware Reference

Our published numbers were measured on:
- CPU: 13th Gen Intel Core i7
- RAM: 32GB DDR5
- OS: Windows 11 Pro
- Node: v24.15.0

## Methodology

All benchmarks are sandbox-safe. No external API calls. No data mutated.
Each benchmark seeds deterministic test data, runs measurements, cleans up.
Full details: `benchmarks/SUITE_SPEC.md`

## Citation

If you use these benchmarks in research:
```
@software{xuanlin_overmind_v4,
  author = {玄霖AI},
  title = {Xuanlin Overmind v4: CC Cognitive Engine},
  year = {2026},
  url = {https://github.com/xuanlinAI/overmind}
}
```
