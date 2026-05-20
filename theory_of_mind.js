// Theory of Mind — user mental model: blind spots, recurring errors, skill gaps
const path = require('path'), fs = require('fs')
const ROOT = path.dirname(__filename)
const MODEL_FILE = path.join(ROOT, '.user_model.json')

const DEFAULT = {
  skills: {}, // { domain: confidence_0_to_1 }
  recurring_errors: [], // [{ pattern: string, count: int, last_seen: iso }]
  blind_spots: [], // [{ topic: string, evidence: string }]
  preferences: { stated: {}, revealed: {} },
  cognitive_style: [], // e.g. 'minimalist', 'iterator', 'explorer'
  last_updated: null
}

function load() { try { return JSON.parse(fs.readFileSync(MODEL_FILE, 'utf-8')) } catch(e) { return JSON.parse(JSON.stringify(DEFAULT)) } }
function save(model) { model.last_updated = new Date().toISOString(); fs.writeFileSync(MODEL_FILE, JSON.stringify(model, null, 2)) }

// Update from session analysis
function update(index) {
  const model = load()
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Scan memory for error patterns
  const errors = db.prepare(`SELECT key, content FROM semantic WHERE ineffective_count >= 2 AND content LIKE '%error%' LIMIT 20`).all()
  for (const e of errors) {
    const text = (e.content || '').toLowerCase()
    for (const kw of ['async','promise','null','undefined','timeout','race','off by one','type','scope','closure','this']) {
      if (text.includes(kw)) {
        const existing = model.recurring_errors.find(r => r.pattern === kw)
        if (existing) { existing.count++; existing.last_seen = new Date().toISOString() }
        else model.recurring_errors.push({ pattern: kw, count: 1, last_seen: new Date().toISOString() })
      }
    }
  }

  // Update skills from completed skill feedback
  const completed = db.prepare(`SELECT skill_name, task_context, effectiveness FROM skill_feedback WHERE event_type='completed' LIMIT 30`).all()
  for (const c of completed) {
    const domain = classifyDomain(c.task_context || c.skill_name)
    const current = model.skills[domain] || 0.5
    model.skills[domain] = Math.min(1, current + (c.effectiveness || 0.5) * 0.1)
  }

  db.close()
  save(model)
  return model
}

function classifyDomain(text) {
  const t = (text || '').toLowerCase()
  if (/reverse|逆向|hook|frida|加密|token/i.test(t)) return '逆向工程'
  if (/code|代码|script|编写|开发/i.test(t)) return '代码开发'
  if (/debug|调试|fix|bug|修复/i.test(t)) return '调试修复'
  if (/arch|架构|design|设计/i.test(t)) return '架构设计'
  if (/test|测试|verify/i.test(t)) return '测试验证'
  return '通用'
}

// Predict what the user might get wrong given current context
function predictErrors(model, currentTask) {
  const warnings = []
  const task = (currentTask || '').toLowerCase()

  // Recurring errors matching current context
  for (const err of (model.recurring_errors || [])) {
    if (err.count >= 3 && task.includes(err.pattern)) {
      warnings.push(`⚠️ 你已在 "${err.pattern}" 上错了 ${err.count} 次。当前任务涉及此模式。`)
    }
  }

  // Low-confidence skill domains
  for (const [domain, conf] of Object.entries(model.skills || {})) {
    if (conf < 0.4 && task.includes(domain.toLowerCase())) {
      warnings.push(`📉 你在 "${domain}" 的置信度为 ${(conf*100).toFixed(0)}%。建议额外验证。`)
    }
  }

  return warnings
}

function format(warnings) {
  if (!warnings || warnings.length === 0) return ''
  return '\n## 🧠 认知预警\n\n' + warnings.join('\n') + '\n'
}

module.exports = { load, update, predictErrors, format }
