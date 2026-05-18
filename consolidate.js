const fs = require('fs')
const path = require('path')
const https = require('https')

const ROOT = path.dirname(__filename)
const API_KEY = process.env.DEEPSEEK_API_KEY || ''

function callAPI(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-v4-pro[1m]',
      max_tokens: 1024,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    })
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/anthropic/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data).content[0].text) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function consolidate() {
  const index = require(path.join(ROOT, 'index'))
  index.init()
  index.ensureMemoryDirs()

  const injFile = path.join(ROOT, 'injection.md')
  let context = ''
  try { context = fs.readFileSync(injFile, 'utf-8').substring(0, 3000) } catch(e) {}

  const sessionId = `s${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const stats = index.getStats()

  let summary = `# Session ${sessionId}\n\n## Context\n${context}\n\n## Stats\nsemantic=${stats.semanticCount} procedural=${stats.proceduralCount} skills=${stats.skillCount}\n`
  index.saveEpisode(sessionId, summary)

  if (context && stats.semanticCount < 100) {
    try {
      const prompt = `分析以下 Claude Code 会话上下文，提取 3 条可以存入长期记忆的关键事实。每条一行，格式：[key] 内容。

会话上下文：
${context.substring(0, 2000)}

提取规则：
- 只提取可复用的技术结论、项目决策、踩坑记录
- 不提取临时状态（当前进度、问题等）
- key 用英文下划线命名

直接输出 3 行，每行格式：key: 内容`

      const result = await callAPI([{ role: 'user', content: prompt }])
      const lines = result.split('\n').filter(l => l.includes(': '))
      for (const line of lines) {
        const m = line.match(/^([\w_]+):\s*(.+)/)
        if (m) {
          index.saveSemantic(m[1], m[2].trim())
          index.logEvolution(sessionId, 'extract', { key: m[1] })
        }
      }
      process.stdout.write(`[ctxproxy] extracted ${lines.length} memory facts\n`)
    } catch(e) {
      process.stdout.write(`[ctxproxy] AI extraction skipped: ${e.message}\n`)
    }
  }

  index.compactMemories()
  index.logEvolution(sessionId, 'session_end', {})

  const afterStats = index.getStats()
  process.stdout.write(`[ctxproxy] session ${sessionId} done | memories: ${stats.semanticCount}→${afterStats.semanticCount}\n`)
}

async function main() {
  const logFile = path.join(ROOT, 'hook.log')
  fs.appendFileSync(logFile, `${new Date().toISOString()} SessionEnd START\n`)
  try {
    await consolidate()
    fs.appendFileSync(logFile, `${new Date().toISOString()} SessionEnd DONE\n`)
  } catch(e) {
    fs.appendFileSync(logFile, `${new Date().toISOString()} SessionEnd ERROR: ${e.message}\n`)
  }
}

main()
