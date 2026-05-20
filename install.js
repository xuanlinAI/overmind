const { execSync, spawn } = require('child_process')
const fs = require('fs'), path = require('path')

const ROOT = path.dirname(__filename)
const HOME = process.env.HOME || process.env.USERPROFILE
const SETTINGS_FILE = path.join(HOME, '.claude', 'settings.json')
const CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md')

function run(cmd, label) {
  try { return execSync(cmd, { cwd:ROOT, stdio:'pipe', timeout:30000 }).toString().trim() }
  catch(e) { return e.stderr?.toString() || e.message }
}

console.log('')
console.log('  ██╗  ██╗ ██╗   ██╗ █████╗ ███╗  ██╗')
console.log('  ╚██╗██╔╝ ██║   ██║██╔══██╗████╗ ██║')
console.log('   ╚███╔╝  ██║   ██║███████║██╔██╗██║')
console.log('   ██╔██╗  ██║   ██║██╔══██║██║╚████║')
console.log('  ██╔╝╚██╗ ╚██████╔╝██║  ██║██║ ╚███║')
console.log('  ╚═╝  ╚═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚══╝')
console.log('  Xuanlin Overmind v4 — Immeasurable Network')
console.log('')

// 1. Dependencies
console.log('[1/5] Installing node dependency...')
const r = run('npm install better-sqlite3 --save')
if (r.includes('ERR')) console.log('  ⚠️ npm install issue, continuing...')
else console.log('  ✅ better-sqlite3 installed')

// 2. Init DBs
console.log('[2/5] Initializing databases...')
try {
  require('./index').init(); require('./index').ensureMemoryDirs()
  require('./graph').init()
  console.log('  ✅ memory.db + graph.db ready')
} catch(e) { console.log('  ⚠️ DB init: ' + e.message) }

// 3. MCP + Hooks to settings.json
console.log('[3/5] Configuring CC hooks + MCP...')
try {
  let settings = { mcpServers: {}, hooks: {} }
  if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) } catch(e) {}
  }

  // MCP
  settings.mcpServers = settings.mcpServers || {}
  settings.mcpServers['ctxproxy'] = {
    type: 'stdio', command: 'python',
    args: [path.join(ROOT, 'daemon.py')], env: {}
  }

  // Hooks
  settings.hooks = settings.hooks || {}
  const hook = (type) => [{ matcher: '', hooks: [{ type:'command', command: `node "${path.join(ROOT, 'inject.js').replace(/\\/g, '/')}"` }] }]
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = hook('SessionStart')
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = hook('UserPromptSubmit')
  if (!settings.hooks.SessionEnd) settings.hooks.SessionEnd = [{ matcher: '', hooks: [{ type:'command', command: `node "${path.join(ROOT, 'consolidate.js').replace(/\\/g, '/')}"` }] }]

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
  console.log('  ✅ Hooks + MCP configured')
} catch(e) { console.log('  ⚠️ settings.json: ' + e.message) }

// 4. Update CLAUDE.md
console.log('[4/5] Updating CLAUDE.md...')
try {
  const injPath = path.join(ROOT, 'injection.md').replace(/\\/g, '/')
  const includeLine = `!include ${injPath}`
  let current = fs.existsSync(CLAUDE_MD) ? fs.readFileSync(CLAUDE_MD, 'utf-8') : ''

  if (!current.includes('Xuanlin Overmind') && !current.includes('玄霖超脑')) {
    // Backup
    if (current.trim()) fs.writeFileSync(CLAUDE_MD + '.bak', current, 'utf-8')
    // Prepend Overmind header + include
    const header = `所有长期记忆及技能由玄霖超脑 (Xuanlin Overmind) 管理。\n当 injection.md 推荐技能时，必须用 Skill 工具调用，禁止手动替代。\n执行前需确认的操作：安装/卸载软件包、系统配置修改、删除文件、Git 强制操作。\n\n${includeLine}\n\n`
    current = header + current
  } else if (!current.includes(includeLine)) {
    current = current.replace(/!include.*injection\.md/g, includeLine)
    if (!current.includes(includeLine)) current = includeLine + '\n\n' + current
  }

  fs.writeFileSync(CLAUDE_MD, current, 'utf-8')
  console.log('  ✅ CLAUDE.md updated')
} catch(e) { console.log('  ⚠️ CLAUDE.md: ' + e.message) }

// 5. Start Worker + Watchdog
console.log('[5/5] Starting background services...')
try {
  spawn('node', [path.join(ROOT, 'extract_worker.js')], { stdio:'ignore', detached:true, windowsHide:process.platform==='win32' }).unref()
  console.log('  ✅ Worker started')
} catch(e) { console.log('  ⚠️ Worker: ' + e.message) }

// Summary
console.log('')
console.log('  ═══════════════════════════════════════')
console.log('  ✅ Xuanlin Overmind v4 installed!')
console.log('  ═══════════════════════════════════════')
console.log('')
console.log('  Quick start:')
console.log('  1. Set LLM API key: export DEEPSEEK_API_KEY=sk-xxx')
console.log('  2. Restart Claude Code')
console.log('  3. Type anything — you should see injection')
console.log('')
console.log('  Verify: Start CC and type "show me the injection"')
console.log('  GitHub: https://github.com/xuanlinAI/overmind')
