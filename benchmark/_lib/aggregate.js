// Aggregate all suite reports into SUMMARY.md
const fs = require('fs'), path = require('path');
const reportDir = process.argv[2] || path.join(__dirname, '..', 'report');

if (!fs.existsSync(reportDir)) {
  console.log('No report directory found');
  process.exit(0);
}

const logs = fs.readdirSync(reportDir).filter(f => f.endsWith('.log'));
const results = { passed: [], failed: [], suites: {} };

for (const log of logs) {
  const suiteName = log.replace('.log', '');
  const content = fs.readFileSync(path.join(reportDir, log), 'utf-8');

  // Count ✅ and ❌
  const passes = (content.match(/✅/g) || []).length;
  const fails = (content.match(/❌/g) || []).length;
  const testLines = content.match(/\| [✅❌] \|/g) || [];
  const passCount = testLines.filter(l => l.includes('✅')).length;
  const failCount = testLines.filter(l => l.includes('❌')).length;

  results.suites[suiteName] = { passes: passCount, fails: failCount };

  if (failCount === 0 && passCount > 0) results.passed.push(suiteName);
  else results.failed.push(suiteName);
}

// Generate SUMMARY.md
const lines = [
  '# Xuanlin Overmind v4 — Hell Benchmark Summary',
  '',
  `**Date:** ${new Date().toISOString()}`,
  '',
  '## Results',
  '',
  '| Suite | Passed | Failed | Status |',
  '|-------|--------|--------|--------|',
];
for (const [suite, r] of Object.entries(results.suites)) {
  const status = r.fails === 0 ? '✅' : '❌';
  lines.push(`| ${suite} | ${r.passes} | ${r.fails} | ${status} |`);
}

const totalPasses = Object.values(results.suites).reduce((a, b) => a + b.passes, 0);
const totalFails = Object.values(results.suites).reduce((a, b) => a + b.fails, 0);
const total = totalPasses + totalFails;
const score = total > 0 ? Math.round((totalPasses / total) * 100) : 0;

lines.push('', `**Total Score: ${score}/100**`, '');
if (score >= 85) lines.push('🏆 **HELL_PASSED** — 地狱级基准测试通过');
else if (score >= 60) lines.push('⚠️ **REVIEW** — 部分通过，需检查失败项');
else lines.push('❌ **HELL_FAILED** — 未通过地狱基准');

lines.push('', '## Suite Details', '');
for (const log of logs) {
  const suiteName = log.replace('.log', '');
  lines.push(`### ${suiteName}`, '', '```', fs.readFileSync(path.join(reportDir, log), 'utf-8').substring(0, 3000), '```', '');
}

const summaryPath = path.join(reportDir, 'SUMMARY.md');
fs.writeFileSync(summaryPath, lines.join('\n'));
console.log(`Summary written to ${summaryPath}`);
console.log(`Score: ${score}/100 — ${score >= 85 ? 'HELL_PASSED' : score >= 60 ? 'REVIEW' : 'HELL_FAILED'}`);

// Write score file for CI
fs.writeFileSync(path.join(reportDir, '.bench_score'), String(score));
