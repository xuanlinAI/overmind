const path = require('path')
const ROOT = path.dirname(__filename)

const TRAITS = [
  { name: '极简主义', patterns: [/no comments/i, /不写注释/i, /delete.*code/i, /删除.*代码/i, /no types/i, /no docstrings/i], weight: 0.7 },
  { name: '安全敏感', patterns: [/security/i, /安全/i, /encrypt/i, /加密/i, /auth/i, /认证/i, /vulnerability/i, /漏洞/i, /reverse/i, /逆向/i], weight: 0.6 },
  { name: '自动化偏好', patterns: [/automate/i, /自动化/i, /script/i, /脚本/i, /cron/i, /定时/i, /batch/i, /批量/i], weight: 0.5 },
  { name: '测试驱动', patterns: [/test/i, /测试/i, /assert/i, /断言/i, /mock/i, /stub/i, /unit test/i, /coverage/i], weight: 0.6 },
  { name: '深度工作者', patterns: [/深夜/i, /凌晨/i, /通宵/i, /deep work/i, /专注/i], weight: 0.3 },
  { name: '函数式偏好', patterns: [/functional/i, /函数式/i, /pure function/i, /immutable/i, /map.*filter.*reduce/i], weight: 0.5 },
  { name: '快速迭代', patterns: [/ship fast/i, /先跑起来/i, /prototype/i, /原型/i, /quick.*test/i, /快速.*验证/i], weight: 0.5 },
  { name: '猎奇探索', patterns: [/尝试/i, /实验/i, /新方法/i, /换.*思路/i, /explore/i, /试试/i], weight: 0.4 },
]

function analyze(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  const scores = {}
  for (const trait of TRAITS) {
    let score = 0
    for (const p of trait.patterns) {
      const count = db.prepare(`SELECT COUNT(*) as c FROM semantic WHERE (content LIKE ? OR key LIKE ?) AND key != '_schema_version'`).get(`%${p.source.replace(/\/[a-z]*$/,'').replace(/^\//,'').replace(/\/$/,'')}%`, `%${p.source.replace(/\/[a-z]*$/,'').replace(/^\//,'').replace(/\/$/,'')}%`)
      // Simpler: just scan all memories
      score = score // placeholder
    }
    scores[trait.name] = 0
  }

  // Scan all memories for trait keywords
  const allMems = db.prepare("SELECT key, content FROM semantic WHERE key != '_schema_version' AND LENGTH(content) > 20").all()

  for (const m of allMems) {
    const text = (m.key + ' ' + m.content).toLowerCase()
    for (const trait of TRAITS) {
      for (const p of trait.patterns) {
        if (p.test(text)) {
          scores[trait.name] = (scores[trait.name] || 0) + trait.weight
          break
        }
      }
    }
  }

  // Also check skill prefs for coding style
  const prefs = db.prepare("SELECT skill_name, task_pattern FROM skill_prefs").all()
  for (const p of prefs) {
    const text = (p.skill_name + ' ' + p.task_pattern).toLowerCase()
    if (/elon/i.test(text)) scores['极简主义'] = (scores['极简主义'] || 0) + 0.5
    if (/reverse|security/i.test(text)) scores['安全敏感'] = (scores['安全敏感'] || 0) + 0.4
    if (/test/i.test(text)) scores['测试驱动'] = (scores['测试驱动'] || 0) + 0.4
  }

  // Normalize and filter
  const traits = Object.entries(scores)
    .filter(([, v]) => v > 1)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, score]) => ({ name, score: Math.round(score * 10) / 10 }))

  const feedback = db.prepare("SELECT COUNT(*) as c FROM feedback_events WHERE event_type = 'helped'").get()
  const totalFeedback = db.prepare("SELECT COUNT(*) as c FROM feedback_events").get()
  const effectiveness = totalFeedback.c > 0 ? Math.round(feedback.c / totalFeedback.c * 100) : 0

  db.close()

  return {
    traits,
    stats: {
      total_memories: allMems.length,
      help_rate: effectiveness
    }
  }
}

function formatPersona(profile) {
  if (!profile || !profile.traits || profile.traits.length === 0) return ''

  const traitLabels = {
    '极简主义': '🧹', '安全敏感': '🔒', '自动化偏好': '🤖',
    '测试驱动': '🧪', '深度工作者': '🌙', '函数式偏好': 'λ',
    '快速迭代': '🚀', '猎奇探索': '🔭'
  }

  return '\n## 👤 人格画像\n\n超脑从你的记忆库中习得：\n\n' +
    profile.traits.map(t => `${traitLabels[t.name] || ''} **${t.name}** (${t.score})`).join(' | ') +
    '\n\n> 越用越了解你。'
}

module.exports = { analyze, formatPersona, observeFleet }

function observeFleet(instances) {
  // Cross-CC skill boosting: detect what other CCs are working on
  // and boost matching skill preferences
  if (!instances || instances.length === 0) return null

  try {
    const index = require('./index')
    index.init()

    const boosts = []
    for (const inst of instances) {
      const topic = (inst.topic || '').toLowerCase()
      const qa = inst.qa || []
      const allText = topic + ' ' + qa.map(p => (p.q || '') + ' ' + (p.a || '')).join(' ')

      // Detect domain from peer's work
      const domains = {
        '逆向工程': [/逆向|reverse|encrypt|解密|破解|frida|xposed|bytecode|虚拟机|smali|native\b|脱壳|反汇编/i],
        'API开发': [/api|http|fetch|接口|请求|响应|rest|graphql|endpoint/i],
        '代码审查': [/审查|review|audit|检查|安全|漏洞|bug|fix/i],
        '数据分析': [/数据分析|爬虫|scrape|parse|数据挖掘|数据清洗/i],
        '环境配置': [/配置|deploy|install|setup|环境|docker|k8s/i],
      }

      for (const [domain, patterns] of Object.entries(domains)) {
        if (patterns.some(p => p.test(allText))) {
          const prefs = index.upsertSkillPref || null

          // Map domain to skill preferences
          const skillMap = {
            '逆向工程': ['enc-signatures', 'jsr-reverse', 'binary-analysis'],
            'API开发': ['api-explorer', 'api-fetcher'],
            '代码审查': ['my-review', 'code-quality'],
            '数据分析': ['data-miner', 'log-analyzer'],
            '环境配置': ['env-setup', 'docker-ops'],
          }

          const skills = skillMap[domain] || []
          for (const sk of skills) {
            try {
              index.upsertSkillPref(sk, domain, 0.7)
              boosts.push({ skill: sk, reason: `同伴 ${inst.id} 在做: ${topic.substring(0,40)}`, domain })
            } catch(e) {}
          }
        }
      }
    }

    if (boosts.length > 0) {
      index.syncSkillPrefsToFile()
      return { boosted: [...new Set(boosts.map(b => b.skill))], reasons: boosts.slice(0, 5) }
    }
    return null
  } catch(e) { return null }
}
