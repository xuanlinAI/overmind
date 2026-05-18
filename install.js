const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.dirname(__filename)
const HOME = process.env.HOME || process.env.USERPROFILE
const SKILLS_DIR = path.join(HOME, '.claude', 'skills')
const SETTINGS_FILE = path.join(HOME, '.claude', 'settings.json')
const CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md')

function run(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim() } catch(e) { return e.stderr?.toString() || e.message }
}

console.log('=== Context Proxy Install ===')

// 1. Install dependencies
console.log('[1/5] Installing dependencies...')
const r = run('npm install better-sqlite3 --save')
console.log(r.substring(0, 200))

// 2. Initialize SQLite DB
console.log('[2/5] Initializing database...')
try {
  const index = require('./index')
  index.init()
  index.ensureMemoryDirs()
  console.log(`  SQLite OK. Semantic: ${index.getStats().semanticCount} records`)
} catch(e) {
  console.log(`  DB init failed: ${e.message}`)
}

// 3. Index all existing skills
console.log('[3/5] Indexing skills...')
try {
  const index = require('./index')
  const skills = index.indexAllSkills(SKILLS_DIR)
  console.log(`  Indexed ${skills.length} skills`)
} catch(e) {
  console.log(`  Skill indexing skipped: ${e.message}`)
}

// 4. Add MCP server to settings.json
console.log('[4/5] Configuring MCP server...')
try {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  settings.mcpServers = settings.mcpServers || {}
  settings.mcpServers['context-proxy'] = {
    type: 'stdio',
    command: 'node',
    args: [path.join(ROOT, 'daemon.js')],
    env: {}
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
  console.log('  MCP server added to settings.json')
} catch(e) {
  console.log(`  settings.json update failed: ${e.message}`)
  console.log(`  Manually add to settings.json.mcpServers: "context-proxy": { "type": "stdio", "command": "node", "args": ["${path.join(ROOT, 'daemon.js')}"] }`)
}

// 5. Update CLAUDE.md
console.log('[5/5] Updating CLAUDE.md...')
try {
  const current = fs.existsSync(CLAUDE_MD) ? fs.readFileSync(CLAUDE_MD, 'utf-8') : ''
  const injectionLine = `!include ${path.join(ROOT, 'injection.md')}`.replace(/\\/g, '/')

  if (!current.includes('Context Proxy')) {
    const newHeader = `所有长期记忆及技能由外挂 Context Proxy 管理。\n修改代码前调用 /elon-code。安装到 D 盘。中文回复。\n执行前需确认的操作：安装/卸载软件包、系统配置修改、删除文件、Git 强制操作。\n\n${injectionLine}\n\n`
    fs.writeFileSync(CLAUDE_MD + '.context-proxy.bak', current, 'utf-8')
    fs.writeFileSync(CLAUDE_MD, newHeader + current, 'utf-8')
    console.log('  CLAUDE.md updated (backup: CLAUDE.md.context-proxy.bak)')
  } else {
    console.log('  CLAUDE.md already has Context Proxy ref, skipping')
  }
} catch(e) {
  console.log(`  CLAUDE.md update failed: ${e.message}`)
}

console.log('\n=== Install complete ===')
console.log('Restart Claude Code to activate.')
console.log('MCP tools: search_memory, save_memory, list_skills, create_skill, memory_stats')
