// Output Shield — verify CC output against memory, flag contradictions
const path = require('path')
const ROOT = path.dirname(__filename)

function verify(outputText, index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
  const flags = []

  // 1. Check for API endpoints that are known stale
  const urls = (outputText || '').match(/https?:\/\/[^\s,)\]}]+/g) || []
  for (const url of urls) {
    const stale = db.prepare(`SELECT key, content FROM semantic WHERE tags LIKE '%stale%' AND content LIKE ? LIMIT 3`).all(`%${url}%`)
    for (const s of stale) {
      flags.push({
        type: 'stale_endpoint',
        severity: 'high',
        message: `⚠️ API ${url} 可能已过期: ${s.content?.substring(0, 80)}`,
        source: s.key
      })
    }
  }

  // 2. Check for config values contradicted by newer memories
  const configPatterns = [/timeout.*?(\d+)/gi, /port.*?(\d+)/gi, /interval.*?(\d+)/gi, /limit.*?(\d+)/gi]
  for (const pattern of configPatterns) {
    let m
    while ((m = pattern.exec(outputText)) !== null) {
      const value = m[1]
      // Check if this value was known to cause problems
      const contradictions = db.prepare(`SELECT key, content FROM semantic WHERE (key LIKE '%timeout%' OR key LIKE '%config%' OR content LIKE '%超时%') AND content LIKE ? LIMIT 3`).all(`%${value}%`)
      for (const c of contradictions) {
        const text = (c.content || '').toLowerCase()
        if (text.includes('fail') || text.includes('失败') || text.includes('error') || text.includes('错误') || text.includes('卡死')) {
          flags.push({
            type: 'known_bad_config',
            severity: 'medium',
            message: `⚡ 值 ${value} 曾导致问题: ${c.content?.substring(0, 80)}`,
            source: c.key
          })
        }
      }
    }
  }

  // 3. Check for approaches that failed before
  const approachKeywords = [/frida/gi, /mitmproxy/gi, /playwright/gi, /hook/gi, /拦截/gi, /抓包/gi]
  for (const pattern of approachKeywords) {
    if (pattern.test(outputText)) {
      const approach = pattern.source.replace(/\/gi$/, '')
      const failures = db.prepare(`SELECT key, content FROM semantic WHERE COALESCE(ineffective_count,0) >= 2 AND (key LIKE ? OR content LIKE ?) LIMIT 5`).all(`%${approach}%`, `%${approach}%`)
      for (const f of failures) {
        flags.push({
          type: 'approach_warning',
          severity: 'medium',
          message: `🟡 ${approach} 曾多次失败: ${f.content?.substring(0, 80)}`,
          source: f.key
        })
      }
    }
  }

  db.close()
  return {
    flags,
    total: flags.length,
    high: flags.filter(f => f.severity === 'high').length,
    medium: flags.filter(f => f.severity === 'medium').length
  }
}

function formatShield(result) {
  if (!result || result.flags.length === 0) return ''
  return '\n## 🛡️ 输出校验\n\n' +
    result.flags.map(f => `${f.message}`).join('\n\n') + '\n'
}

module.exports = { verify, formatShield }
