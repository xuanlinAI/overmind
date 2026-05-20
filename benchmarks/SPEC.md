# Xuanlin Overmind v4 — Benchmark Specification v1.0

## Goals
Prove every claimed capability with reproducible, isolated, sandbox-safe tests. Target: citation-grade rigor. Every number has a CI, every claim has an ablation.

## Test Tiers
| Tier | Time | Suites | Use |
|------|------|--------|-----|
| smoke | 30s | memory, causal | CI on every commit |
| standard | 5min | +predictive, +skill | Pre-release |
| full | 30min | +evolution, +bus, +stress | Release candidate |
| research | 8hr+ | +SWE-Bench, +alignment | Paper publication |

## 12 Categories (850+ tests)

### 1. KG Reasoning (120 tests)
- Multi-hop 2/3/5/8/12-hop accuracy degradation curve
- Transitive closure & contradiction detection
- Counterfactual: "if we remove edge X, what invalidates?"
- Temporal: "what was true at time T?"
- Analogical transfer: domain A → unseen domain B
- Ablation: KG-on vs KG-off delta

### 2. Self-Evolution (80×30 epochs)
- Same task 10 trials → learning curve slope (must be p<0.01)
- Cross-task transfer coefficient
- Catastrophic forgetting: train B/C/D, retest A
- Self-modification audit trail
- Negative-result detection (know when NOT to update)

### 3. Skill Marketplace (90 tests)
- Discovery latency + precision@1/recall@5
- Composition: 2-5 skill chains, success rate
- Quality drift over 100 uses
- Conflict resolution: contradictory skills
- Cold-start: skills acquired per 100 tasks

### 4. Predictive Debugging (100 tests)
- Bug forecasting: 40 real OSS commits, predict bug pre-merge
- Regression prediction: which tests break before running
- Flake detection from history
- Root cause localization (MRR)
- Prevention ROI over 30-day simulation

### 5. Memory Supremacy (110 tests)
- LOCOMO Extended: 100/500/2000/10000 turn recall
- Needle-in-haystack-of-needles (50 needles)
- Conflicting memory reconciliation
- Compression fidelity: recall@compression_ratio_R
- Cross-session identity: recall vs privacy leak

### 6-12. Event Bus, MCP Orchestration, Stress, SWE-Bench+, Metacognition, Scalability, Alignment

## Methodology
- 70/15/15 train/dev/test split, test FROZEN with SHA-256
- N≥30 per metric, 95% CI
- Three random seeds minimum
- Baselines mandatory: vanilla Claude, GPT-4o, Mem0, AgentMemory
- Ablation matrix: {KG, evolution, skills, prediction, bus} on/off
- Reproducibility: Docker image + exact prompts + seeds

## Expected Headlines
| Capability | SOTA Baseline | Overmind Target | Delta |
|---|---|---|---|
| 5-hop KG reasoning | ~15% | ≥70% | +55pp |
| LOCOMO recall@1000 | ~45% (Mem0) | ≥75% | +30pp |
| Learning curve uplift | ~3% | ≥25% | +22pp |
| Bug prediction P@5 | N/A | ≥40% | new |
| Skill composition | ~20% | ≥65% | +45pp |
| SWE-Bench resolution | ~55% | ≥70% | +15pp |
| Calibration ECE | ~0.15 | ≤0.05 | 3× |
