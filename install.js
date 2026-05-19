const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.dirname(__filename)
const HOME = process.env.HOME || process.env.USERPROFILE
const SETTINGS_FILE = path.join(HOME, '.claude', 'settings.json')

function run(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim() } catch(e) { return e.stderr?.toString() || e.message }
}

console.log('=== Xuanlin Overmind Install ===')

// 1. Install dependencies
console.log('[1/3] Installing dependencies...')
const r = run('npm install better-sqlite3 --save')
console.log(r.substring(0, 200))

// 2. Initialize databases
console.log('[2/3] Initializing databases...')
try {
  const index = require('./index')
  index.init()
  index.ensureMemoryDirs()
  const graph = require('./graph')
  graph.init()
  console.log(`  memory.db + graph.db OK. Semantic: ${index.getStats().semanticCount} records`)
} catch(e) {
  console.log(`  DB init failed: ${e.message}`)
}

// 3. Add MCP server to settings.json
console.log('[3/3] Configuring MCP server...')
try {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  settings.mcpServers = settings.mcpServers || {}
  settings.mcpServers['ctxproxy'] = {
    type: 'stdio',
    command: 'python',
    args: [path.join(ROOT, 'daemon.py')],
    env: {}
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
  console.log('  MCP server added to settings.json')
} catch(e) {
  console.log(`  settings.json update failed: ${e.message}`)
  console.log(`  Manually add to settings.json.mcpServers:`)
  console.log(`  "ctxproxy": { "type": "stdio", "command": "python", "args": ["${path.join(ROOT, 'daemon.py')}"] }`)
}

console.log('')
console.log('=== Install complete ===')
console.log('')
console.log('Next steps:')
console.log('1. Set DEEPSEEK_API_KEY environment variable or edit source files')
console.log('2. Add hooks to ~/.claude/settings.json (see README)')
console.log('3. Update ~/.claude/CLAUDE.md with: !include ' + path.join(ROOT, 'injection.md').replace(/\\/g, '/'))
console.log('4. Copy your SKILL.md files to skills/all/ directory')
console.log('5. Restart Claude Code')
