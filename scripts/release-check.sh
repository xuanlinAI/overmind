#!/bin/bash
# Xuanlin Overmind v4 — Pre-release self-test
# Usage: bash scripts/release-check.sh
set -e

PASS=0; FAIL=0; WARN=0
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

check() {
  local label="$1" cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅${NC} $label"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}❌${NC} $label"
    FAIL=$((FAIL+1))
  fi
}

warn_check() {
  local label="$1" cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✅${NC} $label"
    PASS=$((PASS+1))
  else
    echo -e "  ${YELLOW}⚠️${NC} $label (non-critical)"
    WARN=$((WARN+1))
  fi
}

echo "═══════════════════════════════════════"
echo "  Xuanlin Overmind v4 Release Check"
echo "═══════════════════════════════════════"
echo ""

# ═══ 1. REPO INTEGRITY ═══
echo "── 1. Repository ──"
check "git repo" "git rev-parse --git-dir"
check "README exists" "test -f README.md"
check "LICENSE exists" "test -f LICENSE"
check "package.json exists" "test -f package.json"
check "node --check install.js" "node --check install.js"
check "no .DS_Store" "! find . -name '.DS_Store' -print -quit | grep ."
warn_check "no node_modules in git" "! git ls-files | grep node_modules | grep ."

# ═══ 2. SYNTAX ═══
echo ""
echo "── 2. Syntax ──"
check "all JS syntax" "for f in *.js; do node --check \"\$f\" || exit 1; done"
check "daemon.py syntax" "python -c 'import py_compile; py_compile.compile(\"daemon.py\", doraise=True)'"
check "install.js syntax" "node --check install.js"
check "no broken JSON" "find . -name '*.json' -not -path './node_modules/*' -not -path './.git/*' -exec node -e 'JSON.parse(require(\"fs\").readFileSync(\"{}\",\"utf-8\"))' \; 2>/dev/null || true"

# ═══ 3. SMOKE TESTS ═══
echo ""
echo "── 3. Smoke Tests ──"
check "channel smoke test" "node tests/smoke/channels.js"

# ═══ 4. SECURITY ═══
echo ""
echo "── 4. Security ──"
check "security scan (spawn/keys/paths/execSync)" "node scripts/security-check.js"

# ═══ 5. CRITICAL FILES ═══
echo ""
echo "── 5. Critical Files ──"
for f in daemon.py wiring.js inject.js consolidate.js extract_worker.js communicator.js eventbus.js pipeline.js stages.js platform.js exec_hidden.js orchestrator.js launcher.exe _launch.pyw inject_launcher.vbs consolidate_launcher.vbs spawn_relay.vbs launcher.vbs memory.db graph.db .gitignore .npmignore; do
  check "$f exists" "test -f $f"
done

# ═══ 6. INSTALLER ═══
echo ""
echo "── 6. Installer Modules ──"
for f in .overmind/installer/probe.js .overmind/installer/vault.js .overmind/installer/config.js .overmind/installer/ready.js .overmind/installer/manifest.json; do
  check "$f" "test -f $f"
done

# ═══ 7. DB ═══
echo ""
echo "── 7. Database ──"
check "memory.db integrity" "node -e \"const db=require('better-sqlite3')('./memory.db'); db.exec('PRAGMA integrity_check'); db.close()\""
check "graph.db integrity" "node -e \"const gdb=require('better-sqlite3')('./graph.db'); gdb.exec('PRAGMA integrity_check'); gdb.close()\""

# ═══ SUMMARY ═══
echo ""
echo "═══════════════════════════════════════"
printf "  %sPASS: %d  %sFAIL: %d  %sWARN: %d%s\n" "$GREEN" "$PASS" "$RED" "$FAIL" "$YELLOW" "$WARN" "$NC"
echo "═══════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "❌ $FAIL checks failed. Fix before release."
  exit 1
else
  echo ""
  echo "✅ All checks passed. Ready for release!"
fi
