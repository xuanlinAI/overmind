// Hell benchmark assertion library
const fs = require('fs'), path = require('path');
let tests = [], current = null;

function T(name, fn) {
  current = { name, ok: true, error: null, duration: 0 };
  const t0 = Date.now();
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { current.duration = Date.now() - t0; tests.push(current); })
        .catch(e => { current.ok = false; current.error = e.message; current.duration = Date.now() - t0; tests.push(current); });
    }
    current.duration = Date.now() - t0;
    tests.push(current);
  } catch (e) {
    current.ok = false; current.error = e.message; current.duration = Date.now() - t0;
    tests.push(current);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function summary() {
  const passed = tests.filter(t => t.ok).length;
  const failed = tests.filter(t => !t.ok).length;
  return { passed, failed, total: tests.length, tests };
}

function report(reportDir) {
  const s = summary();
  const lines = [`# Benchmark Report — ${new Date().toISOString()}`, '',
    `| Status | Test | Duration | Error |`,
    `|--------|------|----------|-------|`];
  for (const t of tests) {
    const status = t.ok ? '✅' : '❌';
    const err = t.error || '-';
    lines.push(`| ${status} | ${t.name} | ${t.duration}ms | ${err} |`);
  }
  lines.push('', `**Passed: ${s.passed}/${s.total}**`, `**Failed: ${s.failed}**`);
  if (reportDir) {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'report.md'), lines.join('\n'));
  }
  process.stdout.write(lines.join('\n') + '\n');
  return s;
}

module.exports = { T, assert, summary, report };
