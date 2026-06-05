const fs = require('fs')
const path = require('path')

const DEFAULT = {
  paths: {
    home: process.env.HOME || process.env.USERPROFILE || '/tmp',
    claude_dir: null,
    transcript_dir: null,
    skills_dir: null,
    root: path.dirname(__filename),
  },
  worker: {
    poll_interval_ms: 30000,
    min_new_lines: 25,
    max_lifetime_hours: 8,
    session_idle_timeout_min: 15,
  },
  research: {
    idle_trigger_min: 5,
    dream_idle_trigger_min: 30,
    dream_min_interval_hours: 8,
  },
  api: {
    format: 'anthropic',
    hostname: '',
    flash_model: '',
    pro_model: '',
    flash_timeout_ms: 120000,
    pro_timeout_ms: 300000,
    flash_max_tokens: 16384,
    pro_max_tokens: 16384,
    anthropic_path: '/anthropic/v1/messages',
    openai_path: '/v1/chat/completions',
  },
  injection: {
    lite_memory_count: 5,
    full_memory_count: 8,
    lite_skill_count: 0,
    full_skill_count: 3,
    ai_select_skill_candidates: 20,
    ai_select_memory_candidates: 40,
  },
  storage: {
    wal_autocheckpoint_pages: 200,
    max_wal_mb: 10,
  },
  features: {
    auto_research: true,
    auto_dream: true,
    auto_consolidate: true,
    communicator_enabled: true,
  }
}

function load(configPath) {
  let cfg = JSON.parse(JSON.stringify(DEFAULT))
  try {
    const fp = configPath || path.join(path.dirname(__filename), '.overmind_env.json')
    if (fs.existsSync(fp)) {
      const user = JSON.parse(fs.readFileSync(fp, 'utf-8'))
      cfg = deepMerge(cfg, user)
    }
  } catch(e) { console.error('[config] load error:', e.message) }
  return cfg
}

function resolvePaths(cfg) {
  const os = require('os')
  const home = cfg.paths.home || (process.env.HOME || process.env.USERPROFILE || os.homedir())
  cfg.paths.home = home
  cfg.paths.claude_dir = cfg.paths.claude_dir || path.join(home, '.claude')
  cfg.paths.skills_dir = cfg.paths.skills_dir || path.join(home, '.claude', 'skills')
  return cfg
}

function deepMerge(base, override) {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = deepMerge(base[key] || {}, override[key])
    } else {
      result[key] = override[key]
    }
  }
  return result
}

// API 适配器 — 统一入口，支持 Anthropic/OpenAI 双格式
function getAPIConfig(useFlash = true) {
  const cfg = load()
  const api = cfg.api || DEFAULT.api
  const flashModel = process.env.OVERMIND_FLASH_MODEL || api.flashModel || api.flash_model || 'deepseek-v4-flash'
  const proModel = process.env.OVERMIND_PRO_MODEL || api.proModel || api.pro_model || 'deepseek-v4-pro[1m]'
  const model = useFlash ? flashModel : proModel
  const apiKey = process.env.OVERMIND_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.OPENAI_API_KEY || ''
  const timeout = useFlash ? api.flash_timeout_ms : api.pro_timeout_ms
  const maxTokens = useFlash ? api.flash_max_tokens : api.pro_max_tokens
  const format = api.format || process.env.OVERMIND_API_FORMAT || 'anthropic'
  const hostname = api.hostname || process.env.OVERMIND_API_HOSTNAME || 'api.deepseek.com'

  if (format === 'openai') {
    return {
      hostname, path: api.openai_path || '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      bodyBuilder: (messages) => JSON.stringify({
        model, max_tokens: maxTokens,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      }),
      model, timeout, format
    }
  }

  return {
    hostname, path: api.anthropic_path || '/anthropic/v1/messages', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    bodyBuilder: (messages) => JSON.stringify({
      model, max_tokens: maxTokens,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    }),
    model, timeout, format
  }
}

module.exports = { load, DEFAULT, getAPIConfig }
