const fs = require('fs')
const path = require('path')

const DEFAULT = {
  paths: {
    home: process.env.HOME || process.env.USERPROFILE || '/tmp',
    claude_dir: null, // auto-detected
    transcript_dir: null, // auto-detected via util.detectTranscriptDir()
    skills_dir: null, // auto: ~/.claude/skills
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
    flash_timeout_ms: 120000,
    pro_timeout_ms: 300000,
    flash_model: 'deepseek-v4-flash',
    pro_model: 'deepseek-v4-pro[1m]',
    flash_max_tokens: 16384,
    pro_max_tokens: 16384,
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
    const fp = configPath || path.join(path.dirname(__filename), '.overmind_config.json')
    if (fs.existsSync(fp)) {
      const user = JSON.parse(fs.readFileSync(fp, 'utf-8'))
      cfg = deepMerge(cfg, user)
    }
  } catch(e) {}
  return cfg
}

function resolvePaths(cfg) {
  const os = require('os')
  const home = cfg.paths.home || (process.env.HOME || process.env.USERPROFILE || os.homedir())
  cfg.paths.home = home
  cfg.paths.claude_dir = cfg.paths.claude_dir || path.join(home, '.claude')
  cfg.paths.skills_dir = cfg.paths.skills_dir || path.join(home, '.claude', 'skills')
  // transcript_dir is resolved at runtime via util.detectTranscriptDir()
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

module.exports = { load, DEFAULT }
