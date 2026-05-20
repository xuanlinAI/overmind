// Multi-Agent Adapters — one module, any AI coding agent
const path = require('path'), fs = require('fs'), os = require('os')
const ROOT = path.dirname(__filename)

const AGENTS = {
  'claude-code': {
    name: 'Claude Code',
    transcriptDir: () => {
      const detect = require('./util').detectTranscriptDir
      return detect() || path.join(os.homedir(), '.claude', 'projects', 'D--claude')
    },
    transcriptExt: '.jsonl',
    parseEntry: (line) => {
      try { const e = JSON.parse(line); return { role: e.message?.role || 'unknown', content: typeof e.message?.content === 'string' ? e.message.content : JSON.stringify(e.message?.content || '') } }
      catch(e) { return null }
    },
    injectMethod: 'include', // CC's !include injection.md
    injectPath: () => path.join(os.homedir(), '.claude', 'CLAUDE.md'),
    injectString: () => `!include ${path.join(ROOT, 'injection.md').replace(/\\/g, '/')}`,
    hooks: { sessionStart: 'SessionStart', prompt: 'UserPromptSubmit', sessionEnd: 'SessionEnd' }
  },

  'hermes': {
    name: 'Hermes Agent',
    transcriptDir: () => path.join(os.homedir(), '.hermes', 'sessions'),
    transcriptExt: '.jsonl',
    parseEntry: (line) => {
      try { const e = JSON.parse(line); return { role: e.role || 'unknown', content: e.content || '' } }
      catch(e) { return null }
    },
    injectMethod: 'plugin',
    injectPath: () => path.join(os.homedir(), '.hermes', 'plugins', 'overmind'),
    injectString: () => `system_prompt = ${JSON.stringify(fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8').substring(0, 3000))}`,
    hooks: { sessionStart: 'on_session_start', prompt: 'on_user_message', sessionEnd: 'on_session_end' }
  },

  'cursor': {
    name: 'Cursor',
    transcriptDir: () => path.join(os.homedir(), '.cursor', 'history'),
    transcriptExt: '.json',
    parseEntry: (line) => {
      try { const e = JSON.parse(line); return { role: e.role || 'user', content: e.text || e.content || '' } }
      catch(e) { return null }
    },
    injectMethod: 'mcp',
    injectPath: () => path.join(os.homedir(), '.cursor', 'overmind_context.json'),
    injectString: () => JSON.stringify({ system_context: fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8').substring(0, 3000) }),
    hooks: { sessionStart: 'onStart', prompt: 'onPrompt', sessionEnd: 'onStop' }
  },

  'openclaw': {
    name: 'OpenClaw',
    transcriptDir: () => path.join(os.homedir(), '.openclaw', 'conversations'),
    transcriptExt: '.jsonl',
    parseEntry: (line) => {
      try { const e = JSON.parse(line); return { role: e.sender || e.role || 'unknown', content: e.text || e.content || '' } }
      catch(e) { return null }
    },
    injectMethod: 'mcp',
    injectPath: () => path.join(os.homedir(), '.openclaw', 'overmind_context.md'),
    injectString: () => fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8').substring(0, 3000),
    hooks: { sessionStart: 'session:start', prompt: 'message:received', sessionEnd: 'session:end' }
  },

  'codex': {
    name: 'Codex CLI',
    transcriptDir: () => path.join(os.homedir(), '.codex', 'sessions'),
    transcriptExt: '.jsonl',
    parseEntry: (line) => {
      try { const e = JSON.parse(line); return { role: e.role || 'unknown', content: e.message || e.content || '' } }
      catch(e) { return null }
    },
    injectMethod: 'mcp',
    injectPath: () => path.join(os.homedir(), '.codex', 'overmind_ctx.json'),
    injectString: () => JSON.stringify({ injected: fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8').substring(0, 3000) }),
    hooks: { sessionStart: 'agent:start', prompt: 'agent:prompt', sessionEnd: 'agent:end' }
  },

  'gemini': {
    name: 'Gemini CLI',
    transcriptDir: () => path.join(os.homedir(), '.gemini', 'history'),
    transcriptExt: '.json',
    parseEntry: (line) => {
      try { const e = JSON.parse(line); return { role: e.role || 'unknown', content: e.text || e.content || '' } }
      catch(e) { return null }
    },
    injectMethod: 'include', // Gemini supports !include via GEMINI.md
    injectPath: () => path.join(os.homedir(), 'GEMINI.md'),
    injectString: () => `!include ${path.join(ROOT, 'injection.md').replace(/\\/g, '/')}`,
    hooks: { sessionStart: 'gemini:start', prompt: 'gemini:prompt', sessionEnd: 'gemini:end' }
  },

  'aider': {
    name: 'Aider',
    transcriptDir: () => path.join(os.homedir(), '.aider', 'history'),
    transcriptExt: '.jsonl',
    parseEntry: (line) => {
      try { const e = JSON.parse(line); return { role: e.role || 'unknown', content: e.content || '' } }
      catch(e) { return null }
    },
    injectMethod: 'rest', // Aider uses REST API
    injectPath: () => path.join(os.homedir(), '.aider', 'overmind_system.txt'),
    injectString: () => fs.readFileSync(path.join(ROOT, 'injection.md'), 'utf-8').substring(0, 3000),
    hooks: { sessionStart: 'session:start', prompt: 'chat:message', sessionEnd: 'session:end' }
  }
}

// Auto-detect current agent
function detect() {
  const home = os.homedir()
  // Check by directory existence
  if (fs.existsSync(path.join(home, '.claude'))) return 'claude-code'
  if (fs.existsSync(path.join(home, '.hermes'))) return 'hermes'
  if (fs.existsSync(path.join(home, '.cursor'))) return 'cursor'
  if (fs.existsSync(path.join(home, '.openclaw'))) return 'openclaw'
  if (fs.existsSync(path.join(home, '.codex'))) return 'codex'
  if (fs.existsSync(path.join(home, '.gemini'))) return 'gemini'
  if (fs.existsSync(path.join(home, '.aider'))) return 'aider'
  return 'claude-code' // default
}

function getAgent(id) {
  return AGENTS[id || detect()]
}

function list() {
  return Object.keys(AGENTS).map(id => ({ id, name: AGENTS[id].name, injectMethod: AGENTS[id].injectMethod }))
}

module.exports = { AGENTS, detect, getAgent, list }
