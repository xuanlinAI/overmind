#!/bin/bash
# Xuanlin Overmind v4 — Hell Benchmark Suite
# Usage: bash benchmark/run_hell.sh [--quick] [--suite 01_channels]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/benchmark/report/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$REPORT"

SUITES=(00_installer 01_channels 02_kg 07_trigger 08_chaos)
TIMEOUTS=(60 120 60 45 180)
QUICK=false

[[ "$*" =~ "--quick" ]] && QUICK=true && echo "⚡ Quick mode (reduced cycles)"

PASS=0; FAIL=0
for i in "${!SUITES[@]}"; do
  suite="${SUITES[$i]}"
  timeout="${TIMEOUTS[$i]}"
  echo ""
  echo "═══════════════════════════════════════"
  echo "  Suite: $suite (timeout: ${timeout}s)"
  echo "═══════════════════════════════════════"

  runner="$ROOT/benchmark/$suite/runner.js"
  if [ ! -f "$runner" ]; then
    echo "  ⚠️  Skipped (runner not found)"
    continue
  fi

  if timeout "$timeout" node "$runner" --report "$REPORT/$suite" 2>&1 | tee "$REPORT/$suite.log"; then
    echo "  ✅ $suite PASSED"
    PASS=$((PASS+1))
  else
    echo "  ❌ $suite FAILED"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "═══════════════════════════════════════"
echo "  HELL BENCHMARK COMPLETE"
echo "═══════════════════════════════════════"
echo "  PASS: $PASS / ${#SUITES[@]}"
echo "  FAIL: $FAIL"
echo "  Report: $REPORT"
echo ""

# Aggregate
node "$ROOT/benchmark/_lib/aggregate.js" "$REPORT"

exit $FAIL
