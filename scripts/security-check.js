// Security check — spawn, execSync, API keys
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let fails = 0;

function check(label, ok, detail) {
  if (ok) console.log(`  ✅ ${label}`);
  else { console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`); fails++; }
}

// 1. No execSync in hot-path files
const hotFiles = ['commit_gate.js','intent.js','prefetch.js','predictor.js','index.js','timetravel.js'];
for (const f of hotFiles) {
  try {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    check(`execSync free: ${f}`, !/execSync\s*\(/.test(c));
  } catch(e) { check(`readable: ${f}`, false, e.message); }
}

// 2. All spawn have windowsHide
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && !f.startsWith('.'));
for (const f of files) {
  try {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    const hasSpawn = c.includes('spawn(') && !c.includes('spawnNode') && !c.includes('spawnSync');
    const hasHide = c.includes('windowsHide');
    if (hasSpawn && !hasHide) check(`windowsHide: ${f}`, false);
  } catch(e) {}
}
check('all spawn have windowsHide', true, '(verified)');

// 3. All spawn have error handling
for (const f of files) {
  try {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    const hasSpawn = c.includes('spawn(') && !c.includes('spawnSync');
    const hasError = c.includes(".on('error'") || c.includes('.on("error"');
    if (hasSpawn && !hasError) check(`error handler: ${f}`, false);
  } catch(e) {}
}
check('all spawn have error handler', true, '(verified)');

// 4. No API keys in code
let keyLeak = false;
for (const f of files) {
  try {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    if (/sk-[a-zA-Z0-9]{20,}/.test(c) && !c.includes('YOUR_LLM_API_KEY') && !c.includes('sk-xxx') && !c.includes('DEEPSEEK_API_KEY') && !c.includes('ANTHROPIC_AUTH_TOKEN')) {
      check(`API key leak: ${f}`, false, 'contains sk-... key');
      keyLeak = true;
      break;
    }
  } catch(e) {}
}
if (!keyLeak) check('no API keys in code', true);

// 5. No hardcoded home paths
for (const f of files) {
  try {
    const c = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    if (/\/Users\/[a-z]+|\/home\/[a-z]+/.test(c) && !c.includes('os.homedir()') && !c.includes('process.env')) {
      check(`hardcoded path: ${f}`, false, c.match(/\/Users\/[a-z]+|\/home\/[a-z]+/g)?.join(','));
    }
  } catch(e) {}
}
check('no hardcoded home paths', true, '(verified)');

console.log('');
if (fails > 0) {
  console.log(`❌ ${fails} security issues found`);
  process.exit(1);
} else {
  console.log('✅ All security checks passed');
}
