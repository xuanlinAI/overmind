const Database = require('better-sqlite3')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.dirname(__filename)
const GRAPH_DB = path.join(ROOT, 'graph.db')

let db

const RELATION_TYPES = [
  'depends_on',      // A requires B to function
  'part_of',         // A is a component of B
  'blocked_by',      // A is prevented by B
  'causes',          // A leads to B
  'solves',          // A resolves B
  'related_to',      // general association
  'extends',         // A builds on B
  'conflicts_with',  // A contradicts B
  'alternative_to',  // A can replace B
  'triggers'         // A activates B
]

function init() {
  db = new Database(GRAPH_DB)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      key TEXT PRIMARY KEY,
      label TEXT DEFAULT '',
      node_type TEXT DEFAULT 'memory',  -- memory, concept, entity, endpoint, decision
      importance REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      evidence TEXT DEFAULT '',
      source_session TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0,
      UNIQUE(source, target, relation_type)
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(source)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_tgt ON edges(target)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(relation_type)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_edges_src_tgt ON edges(source, target)`)
  try { db.exec('ALTER TABLE edges ADD COLUMN updated_at TEXT') } catch(e) {}

  // FTS for edge search
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS edges_fts USING fts5(source, target, relation_type, evidence, tokenize='unicode61')`)
  } catch(e) {}

  db.pragma('wal_autocheckpoint = 200')

  return db
}

// ---- NODE OPERATIONS ----

function upsertNode(key, label = '', nodeType = 'memory', importance = 0.5) {
  if (!db) init()
  const existing = db.prepare('SELECT key FROM nodes WHERE key = ?').get(key)
  if (existing) {
    db.prepare(`UPDATE nodes SET label=COALESCE(NULLIF(?, ''), label), node_type=COALESCE(NULLIF(?, ''), node_type), importance=MAX(importance, ?), updated_at=datetime('now') WHERE key=?`)
      .run(label, nodeType, importance, key)
  } else {
    db.prepare('INSERT OR IGNORE INTO nodes (key, label, node_type, importance) VALUES (?, ?, ?, ?)')
      .run(key, label, nodeType, importance)
  }
}

function getNode(key) {
  if (!db) init()
  return db.prepare('SELECT * FROM nodes WHERE key = ?').get(key)
}

// ---- EDGE OPERATIONS ----

function upsertEdge(source, target, relationType, confidence = 0.5, evidence = '', sessionId = '') {
  if (!db) init()
  if (!RELATION_TYPES.includes(relationType)) {
    relationType = 'related_to'
  }
  if (source === target) return null

  const existing = db.prepare('SELECT id, confidence, access_count FROM edges WHERE source=? AND target=? AND relation_type=?')
    .get(source, target, relationType)

  if (existing) {
    const newConf = Math.min(1.0, Math.max(existing.confidence, confidence) + 0.05)
    const newEvidence = evidence && !existing.evidence?.includes(evidence)
      ? (existing.evidence || '') + ' | ' + evidence
      : existing.evidence
    db.prepare(`UPDATE edges SET confidence=?, evidence=?, access_count=access_count+1, updated_at=datetime('now') WHERE id=?`)
      .run(newConf, newEvidence, existing.id)
    // Sync FTS
    try {
      db.prepare('DELETE FROM edges_fts WHERE rowid = ?').run(existing.id)
      db.prepare('INSERT INTO edges_fts(rowid, source, target, relation_type, evidence) VALUES (?,?,?,?,?)')
        .run(existing.id, source, target, relationType, newEvidence || '')
    } catch(e) {}
    return existing.id
  }

  const result = db.prepare('INSERT OR IGNORE INTO edges (source, target, relation_type, confidence, evidence, source_session) VALUES (?,?,?,?,?,?)')
    .run(source, target, relationType, confidence, evidence, sessionId)
  if (result.changes > 0) {
    try {
      db.prepare('INSERT INTO edges_fts(rowid, source, target, relation_type, evidence) VALUES (?,?,?,?,?)')
        .run(result.lastInsertRowid, source, target, relationType, evidence)
    } catch(e) {}
    // Auto-create nodes if they don't exist
    upsertNode(source)
    upsertNode(target)
    return result.lastInsertRowid
  }
  return null
}

// ---- GRAPH TRAVERSAL ----

function getNeighbors(key, depth = 2, direction = 'both') {
  if (!db) init()
  const visited = new Set([key])
  const nodes = new Map()
  const edges = []
  let frontier = [key]

  for (let d = 0; d < depth; d++) {
    const nextFrontier = []
    for (const nodeKey of frontier) {
      const rows = []
      if (direction === 'outgoing' || direction === 'both') {
        rows.push(...db.prepare(`SELECT source, target, relation_type, confidence, evidence FROM edges WHERE source = ? ORDER BY confidence DESC`).all(nodeKey))
      }
      if (direction === 'incoming' || direction === 'both') {
        rows.push(...db.prepare(`SELECT source, target, relation_type, confidence, evidence FROM edges WHERE target = ? ORDER BY confidence DESC`).all(nodeKey))
      }

      for (const row of rows) {
        edges.push(row)
        if (!nodes.has(row.source)) {
          nodes.set(row.source, getNode(row.source) || { key: row.source, label: '', node_type: 'memory', importance: 0.5 })
        }
        if (!nodes.has(row.target)) {
          nodes.set(row.target, getNode(row.target) || { key: row.target, label: '', node_type: 'memory', importance: 0.5 })
        }
        const neighbor = row.source === nodeKey ? row.target : row.source
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          nextFrontier.push(neighbor)
        }
      }
    }
    frontier = nextFrontier
  }

  return {
    nodes: [...nodes.values()],
    edges,
    root: key,
    depth
  }
}

function findPath(fromKey, toKey, maxDepth = 3) {
  if (!db) init()
  // BFS path finding
  const visited = new Set([fromKey])
  const queue = [[fromKey, []]]

  while (queue.length > 0) {
    const [current, path] = queue.shift()
    if (path.length >= maxDepth) continue

    const rows = db.prepare(`SELECT source, target, relation_type FROM edges WHERE source = ? OR target = ?`).all(current, current)
    for (const row of rows) {
      const neighbor = row.source === current ? row.target : row.source
      const newPath = [...path, { from: row.source, to: row.target, relation_type: row.relation_type }]

      if (neighbor === toKey) {
        return { found: true, path: newPath, length: newPath.length }
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push([neighbor, newPath])
      }
    }
  }
  return { found: false, path: [], length: 0 }
}

function getConnectedComponents(minSize = 3) {
  if (!db) init()
  const allEdges = db.prepare('SELECT source, target FROM edges').all()
  const adj = {}
  for (const e of allEdges) {
    if (!adj[e.source]) adj[e.source] = new Set()
    if (!adj[e.target]) adj[e.target] = new Set()
    adj[e.source].add(e.target)
    adj[e.target].add(e.source)
  }

  const visited = new Set()
  const components = []

  for (const node of Object.keys(adj)) {
    if (visited.has(node)) continue
    const comp = []
    const stack = [node]
    while (stack.length > 0) {
      const n = stack.pop()
      if (visited.has(n)) continue
      visited.add(n)
      comp.push(n)
      for (const nb of (adj[n] || [])) {
        if (!visited.has(nb)) stack.push(nb)
      }
    }
    if (comp.length >= minSize) components.push(comp)
  }
  return components.sort((a, b) => b.length - a.length)
}

// ---- SUBGRAPH EXPANSION FOR INJECTION ----

function expandKeys(memoryKeys, depth = 1) {
  if (!memoryKeys || memoryKeys.length === 0) return { keys: memoryKeys, subgraph: { nodes: [], edges: [] } }

  const allEdges = []
  const allNodes = new Map()
  const expandedKeys = new Set(memoryKeys)

  for (const key of memoryKeys) {
    upsertNode(key)
    const sub = getNeighbors(key, depth, 'both')
    for (const e of sub.edges) allEdges.push(e)
    for (const n of sub.nodes) {
      allNodes.set(n.key, n)
      expandedKeys.add(n.key)
    }
  }

  return {
    keys: [...expandedKeys],
    subgraph: {
      nodes: [...allNodes.values()],
      edges: allEdges.filter((e, i, arr) =>
        arr.findIndex(x => x.source === e.source && x.target === e.target && x.relation_type === e.relation_type) === i
      )
    }
  }
}

// ---- RELATION EXTRACTION PROMPT ----

function buildExtractionPrompt(memories, transcriptSnippet) {
  const memList = memories.map(m => `- ${m.key}: ${(m.content || '').substring(0, 100)}`).join('\n')
  return `Analyze this conversation snippet and the existing memory keys. Find RELATIONSHIPS between concepts.

## Existing Memory Keys
${memList || '(none yet)'}

## Conversation
${transcriptSnippet.substring(0, 3000)}

## Instructions
Identify how concepts relate. Return ONLY JSON array:
[{"source": "key1", "target": "key2", "relation": "depends_on|part_of|blocked_by|causes|solves|related_to|extends|conflicts_with|alternative_to|triggers", "evidence": "quote from conversation", "confidence": 0.7}]

- source/target must EXIST in the memory keys above, OR be a new concept mentioned in the conversation (use snake_case key)
- Choose the most specific relation type
- confidence: 0.9 = explicitly stated, 0.6 = strongly implied, 0.4 = weak inference

Return [] if no clear relationships found.`
}

function parseExtractionResult(result) {
  if (!result) return []
  try {
    let parsed = JSON.parse(result.trim())
    if (Array.isArray(parsed)) return parsed.filter(r => r.source && r.target && r.relation)
  } catch(e) {}
  // Try to extract JSON array from text
  const m = result.match(/\[[\s\S]*\]/)
  if (m) {
    try {
      let parsed = JSON.parse(m[0])
      if (Array.isArray(parsed)) return parsed.filter(r => r.source && r.target && r.relation)
    } catch(e) {}
  }
  return []
}

function applyRelations(relations, sessionId = '') {
  let added = 0
  for (const rel of relations) {
    if (!rel.source || !rel.target || !rel.relation) continue
    const id = upsertEdge(rel.source, rel.target, rel.relation, rel.confidence || 0.5, rel.evidence || '', sessionId)
    if (id) added++
  }
  return added
}

// ---- STATS ----

function getStats() {
  if (!db) init()
  const nodeCount = db.prepare('SELECT COUNT(*) as c FROM nodes').get().c
  const edgeCount = db.prepare('SELECT COUNT(*) as c FROM edges').get().c
  const typeCounts = db.prepare('SELECT relation_type, COUNT(*) as c FROM edges GROUP BY relation_type ORDER BY c DESC').all()
  const components = getConnectedComponents(3)
  return {
    nodes: nodeCount,
    edges: edgeCount,
    relationTypes: typeCounts,
    components: components.length,
    largestComponent: components[0]?.length || 0
  }
}

// ---- DANGER DETECTION (Proactive Guard) ----

function getWarnings(memoryKeys, feedbackData = {}) {
  if (!db) init()
  if (!memoryKeys || memoryKeys.length === 0) return []

  const warnings = []
  const seen = new Set()

  for (const key of memoryKeys) {
    // Find all edges from/to this key with dangerous relation types
    const edges = db.prepare(
      `SELECT source, target, relation_type, confidence, evidence FROM edges
       WHERE (source = ? OR target = ?) AND relation_type IN ('blocked_by', 'conflicts_with', 'causes')
       AND confidence >= 0.4 ORDER BY confidence DESC`
    ).all(key, key)

    for (const edge of edges) {
      const sig = `${edge.source}→${edge.target}→${edge.relation_type}`
      if (seen.has(sig)) continue
      seen.add(sig)

      let dangerType = null
      let severity = 'medium'
      let reason = ''

      if (edge.relation_type === 'blocked_by') {
        // The current key IS blocked by something
        const blockerKey = edge.target === key ? edge.source : edge.target
        const blockerNode = getNode(blockerKey)
        dangerType = 'blocked'
        severity = edge.confidence >= 0.7 ? 'high' : 'medium'
        reason = edge.evidence
          ? `阻塞节点: ${blockerKey} — ${edge.evidence.substring(0, 200)}`
          : `阻塞节点: ${blockerKey}`

        warnings.push({
          source: key,
          target: blockerKey,
          relation_type: 'blocked_by',
          danger_type: dangerType,
          severity,
          reason,
          confidence: edge.confidence,
          evidence: edge.evidence || '',
          label: `⚠️ 阻塞风险`
        })
      }

      if (edge.relation_type === 'conflicts_with') {
        const otherKey = edge.target === key ? edge.source : edge.target
        dangerType = 'conflict'
        severity = 'medium'
        reason = edge.evidence
          ? `与 ${otherKey} 冲突 — ${edge.evidence.substring(0, 200)}`
          : `与 ${otherKey} 冲突`

        warnings.push({
          source: key,
          target: otherKey,
          relation_type: 'conflicts_with',
          danger_type: dangerType,
          severity,
          reason,
          confidence: edge.confidence,
          evidence: edge.evidence || '',
          label: `⚡ 潜在冲突`
        })
      }

      if (edge.relation_type === 'causes') {
        // "causes" is dangerous when the caused thing has bad feedback
        const causedKey = edge.target === key ? edge.source : edge.target
        const fb = feedbackData[causedKey]

        if (fb && fb.ineffective_count >= 2 && fb.effectiveness < 0.4) {
          dangerType = 'failure_pattern'
          severity = 'high'
          reason = edge.evidence
            ? `${key} → ${causedKey}: ${edge.evidence.substring(0, 200)}（该模式曾失败 ${fb.ineffective_count} 次）`
            : `${key} 曾导致 ${causedKey} 失败 ${fb.ineffective_count} 次`

          warnings.push({
            source: key,
            target: causedKey,
            relation_type: 'causes',
            danger_type: dangerType,
            severity,
            reason,
            confidence: edge.confidence,
            evidence: edge.evidence || '',
            failure_count: fb.ineffective_count,
            effectiveness: fb.effectiveness,
            label: `🔴 失败模式`
          })
        }
      }
    }

    // Check own feedback for poor effectiveness
    const fb = feedbackData[key]
    if (fb && fb.ineffective_count >= 3 && fb.effectiveness < 0.3 && fb.injected_count >= 2) {
      const sig = `self:${key}`
      if (!seen.has(sig)) {
        seen.add(sig)
        warnings.push({
          source: key,
          target: key,
          relation_type: 'self',
          danger_type: 'persistent_failure',
          severity: 'medium',
          reason: `该记忆被注入 ${fb.injected_count} 次，但 ${fb.ineffective_count} 次无效（有效率 ${fb.effectiveness.toFixed(1)}）`,
          confidence: 0.8,
          evidence: '',
          failure_count: fb.ineffective_count,
          effectiveness: fb.effectiveness,
          injected_count: fb.injected_count,
          label: `🟡 低效记忆`
        })
      }
    }
  }

  // Sort by severity then confidence
  const sevOrder = { high: 0, medium: 1, low: 2 }
  return warnings.sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || (b.confidence - a.confidence))
}

// Build warning text for injection.md
function formatWarnings(warnings, maxWarnings = 5) {
  if (!warnings || warnings.length === 0) return ''

  const top = warnings.slice(0, maxWarnings)
  const lines = ['## ⚠️ 危险信号']

  for (const w of top) {
    lines.push('')
    lines.push(`### ${w.label}`)
    lines.push(w.reason)
    if (w.relation_type !== 'self' && w.source !== w.target) {
      lines.push(`路径: \`${w.source}\` —[\`${w.relation_type}\`]→ \`${w.target}\``)
    }
    if (w.failure_count) {
      lines.push(`失败次数: ${w.failure_count} | 有效率: ${(w.effectiveness * 100).toFixed(0)}%`)
    }
  }

  lines.push('')
  lines.push('> 以上基于历史记忆图谱生成，请注意规避。')
  return lines.join('\n')
}

// ---- SEARCH ----

function searchGraph(query, limit = 10) {
  if (!db) init()
  if (!query) {
    return db.prepare('SELECT * FROM edges ORDER BY confidence DESC LIMIT ?').all(limit)
  }
  // Search edges via FTS
  let rows
  try {
    rows = db.prepare(`SELECT e.source, e.target, e.relation_type, e.confidence, e.evidence
      FROM edges_fts f JOIN edges e ON f.rowid = e.id
      WHERE edges_fts MATCH ? ORDER BY rank LIMIT ?`).all(query, limit)
  } catch(e) {
    // FTS query syntax error fallback: search by LIKE
    const likeQ = `%${query}%`
    rows = db.prepare(`SELECT source, target, relation_type, confidence, evidence FROM edges
      WHERE source LIKE ? OR target LIKE ? OR relation_type LIKE ? OR evidence LIKE ?
      ORDER BY confidence DESC LIMIT ?`).all(likeQ, likeQ, likeQ, likeQ, limit)
  }
  return rows
}

module.exports = {
  init, RELATION_TYPES,
  upsertNode, getNode,
  upsertEdge, getNeighbors, findPath,
  getConnectedComponents, expandKeys,
  buildExtractionPrompt, parseExtractionResult, applyRelations,
  searchGraph, getStats,
  getWarnings, formatWarnings
}
