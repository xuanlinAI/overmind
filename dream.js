const path = require('path')
const fs = require('fs')
const https = require('https')
const ROOT = path.dirname(__filename)
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || 'YOUR_LLM_API_KEY'
const DREAM_FILE = path.join(ROOT, '.dream_findings.json')

function callFlashAPI(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 8192,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      timeout: 120000
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

function callProAPI(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-pro[1m]',
      max_tokens: 16384,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/anthropic/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      timeout: 300000
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const body = JSON.parse(data)
          if (body.error) { reject(new Error(body.error.message)); return }
          const textBlock = body.content?.find(c => c.type === 'text')
          resolve(textBlock ? textBlock.text : (body.content?.[0]?.text || ''))
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function dream(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // Gather memory summary (aggregated, not raw dump)
  const stats = index.getStats()

  // Top 30 most accessed memories
  const topMems = db.prepare(`SELECT key, content, tags, access_count, COALESCE(effectiveness_score,0.5) as eff, COALESCE(injected_count,0) as ic, created_at FROM semantic WHERE key != '_schema_version' ORDER BY access_count DESC LIMIT 30`).all()

  // Top contradictions from graph
  let conflicts = []
  try {
    const gdb = require('better-sqlite3')(path.join(ROOT, 'graph.db'))
    conflicts = gdb.prepare(`SELECT e.source, e.target, e.evidence, e.confidence FROM edges e WHERE e.relation_type = 'conflicts_with' ORDER BY e.confidence DESC LIMIT 10`).all()
    gdb.close()
  } catch(e) {}

  // Recent open issues
  const issues = db.prepare(`SELECT key, content, created_at FROM semantic WHERE key != '_schema_version' AND (key LIKE '%issue_%' OR key LIKE '%blocker%' OR key LIKE '%unresolved%' OR content LIKE '%未解决%' OR content LIKE '%尚未解决%') ORDER BY created_at DESC LIMIT 10`).all()

  // Skill effectiveness summary
  const skillSummary = db.prepare(`SELECT skill_name, SUM(CASE WHEN event_type='completed' THEN 1 ELSE 0 END) as done, SUM(CASE WHEN event_type='failed' THEN 1 ELSE 0 END) as fail FROM skill_feedback GROUP BY skill_name ORDER BY done DESC LIMIT 15`).all()

  // Build context for pro model
  const catalog = [
    `## 记忆状态: ${stats.semanticCount} 条语义记忆, ${stats.skillCount} 个技能`,
    '',
    '### 高访问记忆 (top 30)',
    ...topMems.map(m => `- ${m.key}: ${m.content?.substring(0, 120)} [访问:${m.access_count} 有效率:${(m.eff*100).toFixed(0)}% 注入:${m.ic}次]`),
    '',
    '### 活跃矛盾',
    ...(conflicts.length ? conflicts.map(c => `- ${c.source} ↔ ${c.target}: ${c.evidence?.substring(0, 100)}`) : ['- 无活跃矛盾']),
    '',
    '### 未解决问题',
    ...(issues.length ? issues.map(i => `- ${i.key}: ${i.content?.substring(0, 100)} [${i.created_at}]`) : ['- 无']),
    '',
    '### 技能效果',
    ...(skillSummary.length ? skillSummary.map(s => `- ${s.skill_name}: 成功${s.done} 失败${s.fail}`) : ['- 暂无数据']),
  ].join('\n')

  const prompt = `你是一个 AI 认知引擎的夜间分析模块。分析以下记忆库快照，产出深度研究结论。

## 任务
1. **记忆融合**: 找到 3-5 组表达同一事实但用不同方式描述的记忆，给出合并后的精确表述
2. **矛盾仲裁**: 裁决矛盾，给出确定性结论
3. **知识缺口**: 识别 3 个最关键的未解决问题，按严重度排序
4. **模式发现**: 从技能效果数据中提取最有效的工解模式
5. **预测**: 基于历史数据，预测当前路径最可能的结果

## 输出格式
返回 JSON:
{
  "merges": [{"fragment_keys": ["key1","key2"], "merged_fact": "合并后的精确事实"}],
  "arbitrations": [{"conflict": "A vs B", "winner": "A", "verdict": "确定性结论"}],
  "critical_gaps": [{"issue": "问题描述", "severity": "high|medium", "impact": "不解决会导致..."}],
  "patterns": [{"pattern": "模式描述", "evidence": "证据", "recommendation": "建议"}],
  "prediction": {"most_likely": "最可能走向", "confidence": 0.0-1.0, "alternative": "替代路径"},
  "summary": "2-3 句整体总结"
}

## 记忆快照
${catalog}`

  try {
    let result = null
    try {
      result = await callProAPI([{ role: 'user', content: prompt }])
    } catch(e) {
      // Pro failed — fallback to flash
    }

    // Flash fallback: if pro returned nothing or crashed
    if (!result) {
      const flashPrompt = `简化分析以下记忆库快照，只输出关键发现。返回 JSON: {"merges":[], "critical_gaps":[], "summary":"一句话总结"}
${catalog.substring(0, 5000)}`
      try {
        result = await callFlashAPI([{ role: 'user', content: flashPrompt }])
      } catch(e2) {
        return null
      }
    }
    if (!result) return null

    // Parse JSON from response
    let findings = null
    try { findings = JSON.parse(result.trim()) } catch(e) {
      const m = result.match(/\{[\s\S]*\}/)
      if (m) try { findings = JSON.parse(m[0]) } catch(e2) {}
    }
    if (!findings) return null

    findings.dreamed_at = new Date().toISOString()
    findings.stats = stats

    // Save to file
    fs.writeFileSync(DREAM_FILE, JSON.stringify(findings, null, 2), 'utf-8')
    // v4: emit dream complete event
    try { require(path.join(ROOT, 'eventbus')).emit('dream:complete', { findings, stats }) } catch(e) {}

    // Apply merges
    for (const mg of (findings.merges || [])) {
      const keys = mg.fragment_keys
      const mergedKey = keys[0] + '_dream_merged'
      const mergedContent = `[梦境融合 ${keys.length} 条记忆] ${mg.merged_fact}`
      try {
        db.prepare('INSERT OR REPLACE INTO semantic (key, content, tags, confidence) VALUES (?,?,?,?)').run(mergedKey, mergedContent, 'dream-merged', 0.8)
        for (const k of keys) {
          db.prepare("UPDATE semantic SET tags = COALESCE(tags,'') || ',dream-merged', confidence = confidence * 0.5 WHERE key = ?").run(k)
        }
      } catch(e) {}
    }

    db.close()
    return findings
  } catch(e) {
    db.close()
    return null
  }
}

function loadDreamFindings() {
  try {
    if (!fs.existsSync(DREAM_FILE)) return null
    const data = JSON.parse(fs.readFileSync(DREAM_FILE, 'utf-8'))
    const age = Date.now() - new Date(data.dreamed_at).getTime()
    if (age > 24 * 60 * 60 * 1000) return null // stale
    return data
  } catch(e) { return null }
}

function formatDream(findings) {
  if (!findings) return ''
  let text = `\n## 🌙 梦境研究\n\n超脑昨夜深度分析了记忆库 (${findings.stats?.semanticCount || '?'} 条记忆)：\n\n`

  if (findings.summary) {
    text += `**${findings.summary}**\n\n`
  }

  if (findings.merges?.length) {
    text += '### 记忆融合\n' + findings.merges.map(m =>
      `- ${m.fragment_keys.join(' + ')} → ${m.merged_fact?.substring(0, 150)}`
    ).join('\n') + '\n\n'
  }

  if (findings.arbitrations?.length) {
    text += '### 矛盾裁决\n' + findings.arbitrations.map(a =>
      `- **${a.winner}** 胜出: ${a.verdict?.substring(0, 150)}`
    ).join('\n') + '\n\n'
  }

  if (findings.critical_gaps?.length) {
    text += '### 关键缺口\n' + findings.critical_gaps.map(g =>
      `- [${g.severity}] ${g.issue}: ${g.impact?.substring(0, 120)}`
    ).join('\n') + '\n\n'
  }

  if (findings.patterns?.length) {
    text += '### 有效模式\n' + findings.patterns.map(p =>
      `- ${p.pattern}: ${p.recommendation?.substring(0, 120)}`
    ).join('\n') + '\n\n'
  }

  if (findings.prediction) {
    text += `### 预测\n最可能: ${findings.prediction.most_likely} (置信度 ${(findings.prediction.confidence*100).toFixed(0)}%)\n`
  }

  text += `\n> 下一次梦境: 明天凌晨\n`
  return text
}

module.exports = { dream, loadDreamFindings, formatDream }
