const https = require('https')
const fs = require('fs')
const path = require('path')
const ROOT = path.dirname(__filename)
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || 'YOUR_LLM_API_KEY'

function callFlash(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }]
    })
    const req = https.request({
      hostname: 'your-llm-api.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      timeout: 30000
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data).choices[0].message.content) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function filter(fullDoc, userTask, isSessionStart = false) {
  if (!fullDoc || fullDoc.length < 500) return fullDoc // too short, pass through

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
    const result = await callFlash(prompt)
    if (!result || result.length < 100) {
      // Fallback: return full doc trimmed
      return fullDoc.substring(0, isSessionStart ? 3000 : 1500)
    }
    return result.trim()
  } catch(e) {
    // Fallback: return full doc trimmed
    return fullDoc.substring(0, isSessionStart ? 3000 : 1500)
  }
}

module.exports = { filter }
