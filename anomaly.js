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

module.exports = { detect, formatAnomalies, detectFleetAnomaly }

function detectFleetAnomaly(instances) {
  if (!instances || instances.length < 2) return null

  try {
    const fs = require('fs'), path = require('path')
    const alerts = []

    // 1. Same file access check
    const activeInstances = instances.filter(i => i.status === 'active')
    const topics = activeInstances.map(i => ({ id: i.id || '?', topic: (i.topic || '').toLowerCase(), cwd: i.cwd || '' }))

    for (let i = 0; i < topics.length - 1; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const a = topics[i], b = topics[j]

        // Check for same project/file mentions
        const filePattern = /([a-z0-9_\-./]+\.[a-z]{1,6})/g
        const filesA = new Set((a.topic.match(filePattern) || []).map(f => f.toLowerCase()))
        const filesB = new Set((b.topic.match(filePattern) || []).map(f => f.toLowerCase()))
        const common = [...filesA].filter(f => filesB.has(f))

        if (common.length > 0) {
          alerts.push({
            type: 'fleet_conflict',
            severity: 'high',
            message: `⚠️ 两个 CC 可能在同一文件工作: ${common.slice(0, 3).join(', ')}`,
            instances: [a.id.substring(0, 8), b.id.substring(0, 8)],
            suggestion: `建议分工协调，避免合并冲突`
          })
        }

        // Check for same topic overlap
        const wordsA = new Set(a.topic.split(/[，,、\s]+/).filter(w => w.length > 2))
        const wordsB = new Set(b.topic.split(/[，,、\s]+/).filter(w => w.length > 2))
        const commonWords = [...wordsA].filter(w => wordsB.has(w))

        if (commonWords.length >= 3) {
          alerts.push({
            type: 'fleet_overlap',
            severity: 'medium',
            message: `两个 CC 话题高度重叠: ${commonWords.slice(0, 5).join(', ')}`,
            instances: [a.id.substring(0, 8), b.id.substring(0, 8)],
            suggestion: `考虑合并任务或明确分工`
          })
        }
      }
    }

    // 2. Same working directory
    const cwdCount = {}
    for (const inst of activeInstances) {
      const c = inst.cwd || ''
      if (c) cwdCount[c] = (cwdCount[c] || 0) + 1
    }
    for (const [cwd, count] of Object.entries(cwdCount)) {
      if (count > 1) {
        const sharing = activeInstances.filter(i => (i.cwd || '') === cwd)
        alerts.push({
          type: 'shared_cwd',
          severity: 'low',
          message: `${count} 个 CC 共享工作目录: ${cwd}`,
          instances: sharing.map(i => (i.id || '?').substring(0, 8)),
          suggestion: `共享目录注意文件锁和冲突`
        })
      }
    }

    return alerts.length > 0 ? alerts : null
  } catch(e) { return null }
}
