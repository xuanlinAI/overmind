const fs = require('fs')
const path = require('path')

const ROOT = path.dirname(__filename)
const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/Administrator'
const SKILLS_DIR = path.join(HOME, '.claude', 'skills')

let index

function loadIndex() {
  if (!index) {
    try { index = require(path.join(ROOT, 'index')) } catch(e) {
      process.stderr.write(`index load failed: ${e.message}\n`)
    }
  }
  return index
}

// Content-Length framing (LSP protocol) — this is what CC expects
function send(obj) {
  const body = JSON.stringify(obj)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  process.stdout.write(header + body)
}

function handle(msg) {
  const idx = loadIndex()
  if (!idx) return

  const id = msg.id
  const method = msg.method
  const params = msg.params || {}
  const args = params.arguments || {}

  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'context-proxy', version: '1.0.0' }
    }})
  }

  if (id === undefined) return

  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: [
      {
        name: 'search_memory',
        description: '混合检索记忆（BM25 + 向量），返回 top-K 相关记忆',
        inputSchema: { type: 'object', properties: {
          query: { type: 'string', description: '搜索查询' },
          limit: { type: 'number', description: '返回条数，默认 10' }
        }, required: ['query'] }
      },
      { name: 'save_memory', description: '手动保存一条语义记忆',
        inputSchema: { type: 'object', properties: {
          key: { type: 'string' }, content: { type: 'string' }, tags: { type: 'string' }
        }, required: ['key', 'content'] } },
      { name: 'list_skills', description: '列出匹配查询的技能',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
      { name: 'create_skill', description: '创建新 SKILL.md 文件',
        inputSchema: { type: 'object', properties: {
          name: { type: 'string' }, description: { type: 'string' }, content: { type: 'string' }
        }, required: ['name', 'description', 'content'] } },
      { name: 'memory_stats', description: '记忆统计',
        inputSchema: { type: 'object', properties: {} } }
    ]}})
  }

  if (method === 'tools/call') {
    const tool = params.name
    idx.init()
    idx.ensureMemoryDirs()

    if (tool === 'search_memory') {
      const r = idx.searchHybrid(args.query, args.limit || 10)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } })
    }
    if (tool === 'save_memory') {
      idx.saveSemantic(args.key, args.content, args.tags || '')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'saved: ' + args.key }] } })
    }
    if (tool === 'list_skills') {
      const sk = idx.searchSkills(args.query || '')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(sk) }] } })
    }
    if (tool === 'create_skill') {
      const dir = path.join(SKILLS_DIR, args.name)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'SKILL.md'), args.content, 'utf-8')
      idx.indexAllSkills(SKILLS_DIR)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'skill created: ' + args.name }] } })
    }
    if (tool === 'memory_stats') {
      const st = idx.getStats()
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(st) }] } })
    }
  }
}

function main() {
  const idx = loadIndex()
  if (!idx) { process.exit(1) }
  idx.init()
  idx.ensureMemoryDirs()
  idx.indexAllSkills(SKILLS_DIR)

  let buf = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', chunk => {
    buf += chunk
    while (true) {
      const headerEnd = buf.indexOf('\r\n\r\n')
      if (headerEnd === -1) break
      const header = buf.slice(0, headerEnd)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) { buf = buf.slice(headerEnd + 4); continue }
      const len = parseInt(match[1], 10)
      const bodyStart = headerEnd + 4
      if (buf.length < bodyStart + len) break
      const body = buf.slice(bodyStart, bodyStart + len)
      buf = buf.slice(bodyStart + len)
      try { handle(JSON.parse(body)) } catch(e) {}
    }
  })
  process.stdin.on('end', () => { process.exit(0) })
  process.stdin.resume()
}

main()
