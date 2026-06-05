// n2终端 (n2 Terminal) — AI filter + post-filter serial/parallel gateway
// Original: communicator.filter() — AI flash model filters injection doc
// z2 expansion: terminalSerial() + terminalBroadcast() — processed output to all modules
const https = require('https')
const fs = require('fs')
const path = require('path')
const ROOT = path.dirname(__filename)

const { getAPIConfig } = require('./config')

function callLLM(messages, useFlash = true) {
  return new Promise((resolve, reject) => {
    let cfg; try { cfg = getAPIConfig(useFlash) } catch(e) { reject(e); return }
    const body = cfg.bodyBuilder(Array.isArray(messages) ? messages : [{ role: 'user', content: messages }])
    const req = require('https').request({
      hostname: cfg.hostname, path: cfg.path, method: 'POST',
      headers: cfg.headers, timeout: cfg.timeout
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const obj = JSON.parse(data)
          if (obj.error) { reject(new Error(obj.error.message || 'API error')); return }
          if (cfg.format === 'openai') { resolve(obj.choices?.[0]?.message?.content || ''); return }
          const textBlock = obj.content?.find(c => c.type === 'text')
          resolve(textBlock ? textBlock.text : (obj.content?.[0]?.text || ''))
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}


async function filter(fullDoc, userTask, isSessionStart = false) {
  if (!fullDoc || fullDoc.length < 500) return fullDoc

  const mode = isSessionStart ? 'SessionStart' : 'UserPromptSubmit'

  const prompt = `You are a context filter for an AI coding assistant's injection system.

Your job: read the full injection document and produce a PRIORITY-FILTERED version.

## Filter Mode: ${mode}

${mode === 'SessionStart' ? `
SessionStart rules:
- Keep ALL sections that provide orientation: 人格画像, 梦境研究, 上次对话, 未解决问题, 意图预判
- Keep skill injection section (but only the skill names, remove full docs — just write "Skill: name — one-line description")
- Keep 5 most relevant memories (remove weakly related ones)
- Keep ALL warnings (they're critical)
- Remove: 成本分析 (noise on startup), 知识验证 (background task), 环境预取 (too verbose)
- Be generous — user just opened CC, they need context
` : `
UserPromptSubmit rules:
- User is mid-conversation. Context is precious. But don't lose orientation.
- Keep: current task, warnings, 3 most relevant memories, skill injection (collapsed to one line each)
- Keep but compress to 1 line: 人格画像 (just the top 2 traits), 梦境研究 (only if summary is task-relevant), 异常检测 (only if severity high)
- Remove: 成本分析, 技能编排, 知识验证, 环境预取, 时间旅行, 跨项目知识 (background tasks, not needed mid-convo)
- AIM FOR <1200 chars total output
`}

## Current User Task
${(userTask || '未检测到').substring(0, 200)}

## Full Injection Document
${fullDoc.substring(0, 8000)}

## Output Instructions
Return the FILTERED injection document DIRECTLY (keep the markdown format).
- Keep the "# Xuanlin Overmind" header
- Only include sections that pass your filter
- For skill sections, collapse multi-line instructions to one line
- For memory sections, keep only the most relevant entries
- Do NOT add new content. Only filter what's provided.
- For SessionStart: aim for <3500 chars. For UserPromptSubmit: aim for <1200 chars.`

  try {
    const result = await callLLM(prompt)
    if (!result || result.length < 100) {
      return fullDoc.substring(0, isSessionStart ? 3000 : 1500)
    }
    return result.trim()
  } catch(e) {
    return fullDoc.substring(0, isSessionStart ? 3000 : 1500)
  }
}

// ═══════════════════════════════════════════════════════════
// CH5: n2终端 串联 — post-filter chain through modules in sequence
// Each module receives the filtered doc + can enrich/annotate
// ═══════════════════════════════════════════════════════════

function terminalSerial(filteredDoc, ctx = {}) {
  const results = {}
  const chain = [
    { name: 'persona', fn: () => {
      try { const m = require('./persona'); const p = m.analyze(ctx.index || require('./index')); return p?.traits?.length > 0 ? `\n## 👤 终端确认\n超脑人格匹配: ${p.traits.slice(0,2).map(t=>t.name).join(', ')}` : null } catch(e) { return null }
    }},
    { name: 'continuity', fn: () => {
      try { const m = require('./continuity'); const r = m.detect(ctx.index || require('./index')); return r?.open_issues?.length > 0 ? `\n## 📋 终端续接\n待解决问题: ${r.open_issues.slice(0,3).join(', ')}` : null } catch(e) { return null }
    }},
    { name: 'counterfactual', fn: () => {
      try { const m = require('./counterfactual'); const r = m.checkDrift(ctx.graph || require('./graph'), ctx.index || require('./index')); return (Array.isArray(r) && r.length > 0) ? `\n## 🔮 终端反事实\n${r.length} 个决策差异需关注` : null } catch(e) { return null }
    }},
    { name: 'shield', fn: () => {
      try { const m = require('./shield'); const v = m.verify(filteredDoc, ctx.index || require('./index')); return v?.flags?.length > 0 ? `\n## 🛡️ 终端盾检\n${v.flags.length} 个风险标记` : null } catch(e) { return null }
    }},
    { name: 'noiselearner', fn: () => {
      try { const m = require('./noiselearner'); const patterns = m.loadPatterns(); const keys = Object.keys(patterns || {}); return keys.length > 0 ? `\n## 🔇 终端降噪\n${keys.length} 个噪声模式已过滤` : null } catch(e) { return null }
    }},
    { name: 'lineage', fn: () => {
      try { const m = require('./lineage'); const skills = ctx.skills || []; return skills.length > 0 ? `\n## 📜 终端血统\n${skills.length} 个技能进入终端` : null } catch(e) { return null }
    }},
    { name: 'budget', fn: () => {
      try { const m = require('./budget'); const r = m.analyze(ctx.index || require('./index')); return r ? `\n## 📊 终端预算\n记忆预算已更新` : null } catch(e) { return null }
    }},
    { name: 'briefing', fn: () => {
      try { const m = require('./briefing'); return `\n## 📋 终端简报\n当前已记录` } catch(e) { return null }
    }},
  ]

  for (const stage of chain) {
    try {
      const out = stage.fn()
      if (out && typeof out === 'string' && out.length > 10) {
        results[stage.name] = out
      }
    } catch(e) {
      results[`${stage.name}_error`] = e.message
    }
  }

  return results
}

// ═══════════════════════════════════════════════════════════
// CH6: n2终端 并联 — broadcast filtered output to all modules
// Every module receives what the user will actually see
// ═══════════════════════════════════════════════════════════

function terminalBroadcast(filteredDoc, ctx = {}) {
  // This is triggered via bus.emit('terminal:broadcast', data)
  // The actual parallel fire happens in wiring.js CH5
  // Here we prepare the broadcast data package
  return {
    content: filteredDoc,
    length: filteredDoc.length,
    skills: ctx.skills || [],
    mems: ctx.mems || [],
    userTask: ctx.userTask || '',
    isSessionStart: ctx.isSessionStart || false,
    fleet_context: ctx.fleetContext || null,
    timestamp: new Date().toISOString()
  }
}

module.exports = { filter, terminalSerial, terminalBroadcast }
