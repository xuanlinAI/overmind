const path = require('path')
const ROOT = path.dirname(__filename)

function detect(index, currentTask = '') {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  const anomalies = []

  // 1. Task domain shift: what are the top 3 skill categories?
  const topSkills = db.prepare(`SELECT skill_name, task_pattern, use_count FROM skill_prefs ORDER BY use_count DESC LIMIT 10`).all()
  const currentDomain = classifyTask(currentTask)
  const dominantDomains = new Set()
  for (const s of topSkills.slice(0, 5)) {
    const domain = classifyTask(s.task_pattern)
    if (domain) dominantDomains.add(domain)
  }

  if (currentDomain && !dominantDomains.has(currentDomain) && dominantDomains.size > 0) {
    anomalies.push({
      type: 'domain_shift',
      severity: 'low',
      message: `当前任务类型 (${currentDomain}) 偏离你的常态 (${[...dominantDomains].join(', ')})`,
      suggestion: '可能是新项目或跨领域工作'
    })
  }

  // 2. Time anomaly: are you working at unusual hours?
  const hour = new Date().getHours()
  const timeAnomaly = hour < 6 || hour >= 23
  if (timeAnomaly && topSkills.length > 0) {
    anomalies.push({
      type: 'time_anomaly',
      severity: 'low',
      message: `当前时间 ${hour}:00 — 深夜模式，建议聚焦单一任务，避免复杂决策`,
      suggestion: '保持简洁输出'
    })
  }

  // 3. Memory growth anomaly: sudden spike?
  const recent = db.prepare("SELECT COUNT(*) as c FROM semantic WHERE created_at > datetime('now','-1 hour')").get()
  const hourly = db.prepare("SELECT COUNT(*) as c FROM semantic WHERE created_at > datetime('now','-24 hours')").get()
  const dailyAvg = hourly.c / 24
  if (recent.c > dailyAvg * 3 && dailyAvg > 0) {
    anomalies.push({
      type: 'memory_spike',
      severity: 'info',
      message: `过去 1 小时新增 ${recent.c} 条记忆 (日均 ${Math.round(dailyAvg)}/h)，高活跃会话`,
      suggestion: 'Worker 提取质量可能下降，建议检查'
    })
  }

  // 4. Skill usage anomaly: using skills you never use
  const recentSkills = db.prepare("SELECT skill_name FROM skill_feedback WHERE event_type='injected' ORDER BY id DESC LIMIT 20").all().map(r=>r.skill_name)
  const commonSkills = new Set(topSkills.slice(0, 5).map(s=>s.skill_name))
  const unusualSkills = [...new Set(recentSkills)].filter(s => !commonSkills.has(s) && s)
  if (unusualSkills.length >= 2) {
    anomalies.push({
      type: 'unusual_skill',
      severity: 'low',
      message: `最近使用了 ${unusualSkills.length} 个非常用技能: ${unusualSkills.slice(0,3).join(', ')}`,
      suggestion: '可能需要更新技能偏好'
    })
  }

  db.close()
  return anomalies
}

function classifyTask(task) {
  if (!task) return null
  const t = task.toLowerCase()
  if (/逆向|reverse|encrypt|解密|破解|frida|bytecode|虚拟机/i.test(t)) return '逆向工程'
  if (/生成|代码|编写|写|build|create|code|script/i.test(t)) return '代码开发'
  if (/审查|review|audit|检查|安全|漏洞/i.test(t)) return '代码审查'
  if (/配置|deploy|install|setup|环境|安装/i.test(t)) return '环境配置'
  if (/调试|debug|fix|bug|修复|报错|错误/i.test(t)) return '调试修复'
  if (/分析|analyze|调查|查.*原因/i.test(t)) return '分析调查'
  return null
}

function formatAnomalies(list) {
  if (!list || list.length === 0) return ''
  const sev = { high:'🔴', medium:'🟡', low:'🟢', info:'💡' }
  return '\n## 🚨 异常检测\n\n' +
    list.map(a => `${sev[a.severity]||''} ${a.message}\n> ${a.suggestion}`).join('\n\n') + '\n'
}

module.exports = { detect, formatAnomalies }
