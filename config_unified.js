// Unified Config — single frozen source for all modules
const path = require('path'), fs = require('fs'), os = require('os')
const ROOT = path.dirname(__filename)

const schema = {
  paths: { home: 'string', claude_dir: 'string', skills_dir: 'string', transcript_dir: 'string' },
  worker: { poll_interval_ms: 'number', min_new_lines: 'number', max_lifetime_hours: 'number', session_idle_timeout_min: 'number' },
  api: { flash_timeout_ms: 'number', pro_timeout_ms: 'number', flash_model: 'string', pro_model: 'string', flash_max_tokens: 'number', pro_max_tokens: 'number' },
  injection: { lite_memory_count: 'number', full_memory_count: 'number', ai_select_skill_candidates: 'number', ai_select_memory_candidates: 'number' },
  storage: { wal_autocheckpoint_pages: 'number', max_wal_mb: 'number' },
  features: { auto_research: 'boolean', auto_dream: 'boolean', auto_consolidate: 'boolean', communicator_enabled: 'boolean' }
}

function validate(obj, shape, prefix) {
  for (const [key, type] of Object.entries(shape)) {
    if (typeof type === 'string') {
      const val = obj[key]
      if (val === undefined || val === null) continue
      if (type === 'boolean' && typeof val !== 'boolean') throw new Error(`config.${prefix}${key}: expected boolean, got ${typeof val}`)
      if (type === 'number' && typeof val !== 'number') throw new Error(`config.${prefix}${key}: expected number, got ${typeof val}`)
      if (type === 'string' && typeof val !== 'string') throw new Error(`config.${prefix}${key}: expected string, got ${typeof val}`)
    } else {
      if (obj[key] && typeof obj[key] === 'object') validate(obj[key], type, `${prefix}${key}.`)
    }
  }
}

function load() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir()
  const claudeDir = path.join(home, '.claude')

  const defaults = {
    paths: { home, claude_dir: claudeDir,
      skills_dir: path.join(claudeDir, 'skills'),
      transcript_dir: path.join(claudeDir, 'projects', 'D--claude') },
    worker: { poll_interval_ms: 30000, min_new_lines: 25, max_lifetime_hours: 8, session_idle_timeout_min: 15 },
    api: { flash_timeout_ms: 120000, pro_timeout_ms: 300000, flash_model: 'deepseek-v4-flash', pro_model: 'deepseek-v4-pro[1m]', flash_max_tokens: 16384, pro_max_tokens: 16384 },
    injection: { lite_memory_count: 5, full_memory_count: 8, ai_select_skill_candidates: 20, ai_select_memory_candidates: 40 },
    storage: { wal_autocheckpoint_pages: 200, max_wal_mb: 10 },
    features: { auto_research: true, auto_dream: true, auto_consolidate: true, communicator_enabled: true }
  }

  // Merge with user config
  const userPath = path.join(ROOT, '.overmind_config.json')
  let user = {}
  try { if (fs.existsSync(userPath)) user = JSON.parse(fs.readFileSync(userPath, 'utf-8')) } catch(e) {}

  function merge(base, override) {
    const r = { ...base }
    for (const k of Object.keys(override)) {
      if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k]) && base[k]) r[k] = merge(base[k], override[k])
      else r[k] = override[k]
    }
    return r
  }

  const merged = merge(defaults, user)

  // Validate at startup — crash fast if bad config
  try { validate(merged, schema, '') } catch(e) {
    console.error(`[overmind] CONFIG ERROR: ${e.message}`)
    // Don't crash — use defaults as fallback
  }

  return Object.freeze(merged)
}

module.exports = { load }
