const path = require('path')
const ROOT = path.dirname(__filename)

function verify(index) {
  index.init()
  const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))

  // 1. Memories older than 7 days with low recent access
  const stale = db.prepare(`
    SELECT key, content, tags, updated_at,
      CAST(julianday('now') - julianday(COALESCE(last_accessed, updated_at, created_at)) AS INTEGER) as days_since_access,
      CAST(julianday('now') - julianday(COALESCE(updated_at, created_at)) AS INTEGER) as age_days
    FROM semantic WHERE key != '_schema_version' AND tags NOT LIKE '%deprecated%'
    AND age_days > 7 AND (last_accessed IS NULL OR days_since_access > 14)
    AND (content LIKE '%api%' OR content LIKE '%endpoint%' OR content LIKE '%URL%'
      OR content LIKE '%端口%' OR content LIKE '%config%' OR content LIKE '%配置%')
    ORDER BY days_since_access DESC LIMIT 15
  `).all()

  let demoted = 0
  const results = []

  for (const m of stale) {
    // Check if there's a newer memory on the same topic
    const keyPrefix = m.key.replace(/_\d+$/,'').replace(/_[a-f0-9]+$/,'')
    const newer = db.prepare(`
      SELECT COUNT(*) as c FROM semantic WHERE key != ? AND key LIKE ?
      AND updated_at > ? AND tags NOT LIKE '%deprecated%'
    `).get(m.key, `${keyPrefix}%`, m.updated_at)

    if (newer.c > 0) {
      db.prepare("UPDATE semantic SET confidence = COALESCE(confidence,0.5) * 0.7, tags = COALESCE(tags,'') || ',stale' WHERE key = ?").run(m.key)
      demoted++
      results.push({
        key: m.key,
        reason: 'newer_version_exists',
        age_days: m.age_days,
        days_since_access: m.days_since_access
      })
    } else if (m.days_since_access > 30) {
      db.prepare("UPDATE semantic SET confidence = COALESCE(confidence,0.5) * 0.6, tags = COALESCE(tags,'') || ',stale' WHERE key = ?").run(m.key)
      demoted++
      results.push({
        key: m.key,
        reason: 'not_accessed_30days',
        age_days: m.age_days,
        days_since_access: m.days_since_access
      })
    }
  }

  // 2. Check for memories that claim an API endpoint exists but was later contradicted
  const contradictions = db.prepare(`
    SELECT s1.key as key1, s1.content as content1, s2.key as key2, s2.content as content2
    FROM semantic s1 JOIN semantic s2 ON s1.key != s2.key
    WHERE s1.key LIKE '%api_%' AND (s2.key LIKE '%api_%' OR s2.content LIKE '%返回%' OR s2.content LIKE '%empty%')
    AND s1.updated_at < s2.updated_at AND julianday(s2.updated_at) - julianday(s1.updated_at) > 3
    LIMIT 10
  `).all()

  db.close()

  return {
    scanned: stale.length,
    demoted,
    contradictions: contradictions.length,
    items: results,
    summary: demoted > 0
      ? `验证 ${stale.length} 条记忆: ${demoted} 条已过期降级`
      : stale.length > 0 ? `验证 ${stale.length} 条记忆: 全部仍有效` : '无可验证的记忆'
  }
}

function formatVerification(result) {
  if (!result || result.scanned === 0) return ''
  return '\n## ✅ 知识验证\n\n' +
    result.summary + '\n' +
    (result.items.length ? result.items.slice(0, 5).map(i =>
      `- ${i.key}: ${i.reason} (${i.age_days}天前, ${i.days_since_access}天未访问)`
    ).join('\n') + '\n' : '')
}

module.exports = { verify, formatVerification }
