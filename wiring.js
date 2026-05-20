// v4 Module Wiring — nervous system connections
// All cross-module communication flows through the EventBus
const bus = require('./eventbus')
const fs = require('fs')
const path = require('path')
const ROOT = path.dirname(__filename)

function init() {
  // === FLOW 1: Memory Extraction → Graph Warning Check ===
  bus.on('memory:extracted', (data) => {
    // New memory was extracted by worker — check if it creates new warnings
    try {
      const graph = require('./graph')
      const fbLookup = getFeedbackLookup()
      const warnings = graph.getWarnings([data.key], fbLookup)
      if (warnings.length > 0) {
        bus.emit('warning:new', { key: data.key, warnings, source: 'memory_extraction' })
      }
      // Track exposure for causal edges
      graph.recordExposure(data.key)
    } catch(e) {}
  })

  // === FLOW 2: Warning Detected → Immediate Injection Refresh ===
  bus.on('warning:new', (data) => {
    bus.emit('inject:request_refresh', { reason: 'new_warning', key: data.key })
    triggerInject()
  })

  // === FLOW 1b: Memory extracted → immediate re-inject if high-value ===
  let memExtractCount = 0
  bus.on('memory:extracted', (data) => {
    memExtractCount++
    if (memExtractCount % 50 === 0 && data.count > 0) triggerInject()
  })

  // === FLOW 3: Dream Phase Complete → Update Graph + Memories ===
  bus.on('dream:complete', (data) => {
    const findings = data.findings
    if (!findings) return

    // Update graph edge weights based on dream findings
    try {
      const graph = require('./graph')
      if (findings.arbitrations) {
        for (const arb of findings.arbitrations) {
          graph.recordExposure(arb.winner || '')
        }
      }
    } catch(e) {}

    // Update persona with fresh data
    bus.emit('persona:refresh', { reason: 'dream_complete' })
  })

  // === FLOW 3b: Dream Complete → Update Graph Weights ===
  bus.on('dream:complete', (data) => {
    const findings = data.findings
    if (!findings || !findings.merges) return
    try {
      const graph = require('./graph')
      // Update graph: merged facts → boost edge confidence
      for (const mg of (findings.merges || [])) {
        const keys = mg.fragment_keys || []
        for (let i = 0; i < keys.length - 1; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            graph.upsertEdge(keys[i], keys[j], 'related_to', 0.85, 'dream-merged', 'dream')
          }
        }
      }
      // Update graph: arbitrations → resolve conflicts_with edges
      for (const arb of (findings.arbitrations || [])) {
        graph.recordExposure(arb.winner || '')
      }
    } catch(e) {}
  })

  // === FLOW 4: Persona Refreshed → Adjust Skill Selection + Communicator ===
  bus.on('persona:refresh', (data) => {
    try {
      const persona = require('./persona')
      const index = require('./index')
      const profile = persona.analyze(index)
      if (profile && profile.traits) {
        bus.emit('persona:updated', { traits: profile.traits })
      }
    } catch(e) {}
  })

  // === FLOW 5: Persona Updated → Skill AI + Communicator Bias ===
  bus.on('persona:updated', (data) => {
    const traits = data.traits || []
    const traitNames = traits.slice(0, 3).map(t => t.name)

    try {
      const index = require('./index')
      index.init()

      // Boost skills matching persona
      if (traitNames.includes('极简主义')) {
        index.upsertSkillPref('elon-code', '生成代码', 0.95)
      }
      if (traitNames.includes('安全敏感')) {
        index.upsertSkillPref('enc-signatures', '逆向工程', 0.85)
      }
      index.syncSkillPrefsToFile()

      // Write communicator bias for persona-aware filtering
      const biasFile = path.join(ROOT, '.persona_bias.json')
      const bias = {
        updated_at: new Date().toISOString(),
        traits: traitNames,
        hints: {}
      }
      if (traitNames.includes('极简主义')) {
        bias.hints.style = 'minimal'
        bias.hints.drop = ['.*解释.*', '.*文档.*', '.*示例.*']
        bias.hints.keep = ['.*代码.*', '.*实现.*']
      }
      if (traitNames.includes('深度工作者')) {
        bias.hints.verbosity = 'terse'
      }
      fs.writeFileSync(biasFile, JSON.stringify(bias, null, 2))
    } catch(e) {}
  })

  // === FLOW 6: Skill Composer Detects Chain → Hotload Meta-Skill ===
  bus.on('composer:chain_detected', (data) => {
    const chain = data.chain || []
    // Write to preload hints file
    try {
      const preloadFile = path.join(ROOT, '.preload_hints.json')
      let hints = {}
      try { hints = JSON.parse(fs.readFileSync(preloadFile, 'utf-8')) } catch(e) {}
      const chainSig = chain.join('→')
      hints[chainSig] = { chain, detected_at: new Date().toISOString(), boosted: true }
      fs.writeFileSync(preloadFile, JSON.stringify(hints, null, 2), 'utf-8')
    } catch(e) {}

    // Hotload: create meta-skill immediately via composer
    try {
      const composer = require('./composer')
      const result = composer.detectChains(require('./index'))
      if (result && result.chains.length > 0) {
        for (const meta of result.chains.slice(0, 2)) {
          composer.createMetaSkill(meta)
        }
        // Trigger daemon re-index via event
        bus.emit('skill:hotloaded', { chains: result.chains.length })
      }
    } catch(e) {}
  })

  // === FLOW 7: Cost Stats → Optimizer Update ===
  bus.on('communicator:filtered', (data) => {
    try {
      const optimizer = require('./optimizer')
      // Accumulate savings
      const savingsFile = path.join(ROOT, '.token_savings.json')
      let savings = { total_saved: 0, total_original: 0 }
      try { savings = JSON.parse(fs.readFileSync(savingsFile, 'utf-8')) } catch(e) {}
      savings.total_saved += (data.original || 0) - (data.filtered || 0)
      savings.total_original += (data.original || 0)
      fs.writeFileSync(savingsFile, JSON.stringify(savings, null, 2), 'utf-8')
    } catch(e) {}
  })

  // === FLOW 8: Knowledge Gap Detected → Cross-Project Alert ===
  bus.on('research:gap_found', (data) => {
    try {
      const transfer = require('./transfer')
      const index = require('./index')
      index.init()
      // Check if this gap exists in other projects
      const related = transfer.getTransferable(data.topic || data.key || '', 5)
      if (related.length > 0) {
        bus.emit('transfer:cross_reference', { gap: data.key, cross_refs: related })
      }
    } catch(e) {}
  })

  // === FLOW 9: Conflict Resolved → Update Persona Confidence ===
  bus.on('arbitrator:resolved', (data) => {
    if (data.resolved > 0) {
      bus.emit('persona:refresh', { reason: 'arbitration_complete' })
    }
  })

  // === FLOW 10: Feedback Events → Instant Refresh ===
  bus.on('feedback:recorded', (data) => {
    const { memoryKey, eventType } = data
    // If memory was marked "helped" → boost related skill prefs
    if (eventType === 'helped' && memoryKey) {
      try {
        const index = require('./index')
        index.init()
        const db = require('better-sqlite3')(path.join(ROOT, 'memory.db'))
        const mem = db.prepare('SELECT content FROM semantic WHERE key = ?').get(memoryKey)
        db.close()
        if (mem && mem.content) {
          const text = (mem.content || '').toLowerCase()
          // Map content to skill domain and boost
          if (/token|sign|encrypt|算法/i.test(text)) {
            index.upsertSkillPref('enc-signatures', '逆向工程', 0.8)
            index.upsertSkillPref('jsr-reverse', '逆向工程', 0.8)
          }
          if (/api|http|fetch|响应/i.test(text)) {
            index.upsertSkillPref('api-explorer', 'API开发', 0.8)
          }
          index.syncSkillPrefsToFile()
        }
      } catch(e) {}
    }
    if (eventType === 'did_not_help' || eventType === 'caused_confusion') {
      bus.emit('persona:refresh', { reason: 'negative_feedback' })
    }
  })

  // === FLOW 11: Inject Complete → Record Cycle ===
  bus.on('inject:complete', (data) => {
    // Log injection cycle for cost tracking
    try {
      const statsFile = path.join(ROOT, '.injection_stats.json')
      let stats = []
      try { stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8')) } catch(e) {}
      stats.push({ ts: new Date().toISOString(), mode: data.mode, chars: data.chars, skills: data.skills?.length || 0 })
      if (stats.length > 200) stats = stats.slice(-200)
      fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2), 'utf-8')
    } catch(e) {}
  })

  // === PARALLEL BROADCAST — 18 modules with safety harness ===
  try {
    const broadcast = require('./broadcast')
    const ROOT = require('path').dirname(__filename)
    const TIMEOUT_MS = 5000

    broadcast.on('inject:parallel', (ctx) => {
      const idx = ctx.index || require('./index')
      const graph = ctx.graph || require('./graph')
      const userTask = ctx.userTask || ''
      const logger = (msg) => { try { require('fs').appendFileSync(require('path').join(ROOT, 'worker.log'), `${new Date().toISOString()} [broadcast] ${msg}\n`) } catch(e) {} }

      const fire = (name, fn) => {
        Promise.race([
          Promise.resolve().then(fn),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
        ]).catch(err => logger(`${name}: ${err.message}`))
      }

      fire('persona', () => require('./persona').analyze(idx))
      fire('anomaly', () => require('./anomaly').detect(idx, userTask))
      fire('optimizer', () => require('./optimizer').analyze())
      fire('composer', () => require('./composer').detectChains(idx))
      fire('verifier', () => require('./verifier').verify(idx))
      fire('prefetch', () => require('./prefetch').prefetch(process.cwd(), userTask))
      fire('dream', () => require('./dream').loadDreamFindings())
      fire('transfer', () => require('./transfer').getTransferable(userTask, 5))
      fire('checkpoint', () => require('./checkpoint_writer').snapshot(idx, graph))
      fire('theory_of_mind', () => require('./theory_of_mind').update(idx))
      fire('budget_killer', () => require('./budget_killer').track(userTask.substring(0,30), null))
      fire('deadcode', () => require('./deadcode').scan(idx))
      fire('healer', () => require('./healer').checkWorker())
      fire('counterfactual', () => require('./counterfactual').checkDrift(graph, idx))
      fire('orchestrator', () => require('./orchestrator').heartbeat(process.env.OVERMIND_INSTANCE_ID||'main'))
      fire('morning', () => require('./morning').generate())
      fire('briefing', () => require('./briefing').generate(null,[],[]))
      fire('budget', () => { try { require('./budget').analyze(idx) } catch(e) {} })
    })
  } catch(e) {}

  console.log('[v4] Wiring initialized — 10 flows + broadcast(21 modules) + 66 total')
}

// Inter-process event queue — bridges worker → injector processes
const EVENTS_DIR = path.join(ROOT, '.event_queue')
function ensureEventsDir() {
  try { if (!fs.existsSync(EVENTS_DIR)) fs.mkdirSync(EVENTS_DIR, { recursive: true }) } catch(e) {}
}
function pushInterProcess(event, data) {
  ensureEventsDir()
  const file = path.join(EVENTS_DIR, `${Date.now()}_${event}.json`)
  try { fs.writeFileSync(file, JSON.stringify({ event, data, ts: Date.now() }), 'utf-8') } catch(e) {}
}
function drainInterProcess(maxAge = 60000) {
  ensureEventsDir()
  const now = Date.now()
  const events = []
  try {
    for (const f of fs.readdirSync(EVENTS_DIR)) {
      if (!f.endsWith('.json')) continue
      const fp = path.join(EVENTS_DIR, f)
      try {
        const age = now - fs.statSync(fp).mtimeMs
        if (age > maxAge) { fs.unlinkSync(fp); continue }
        const data = JSON.parse(fs.readFileSync(fp, 'utf-8'))
        events.push(data)
        fs.unlinkSync(fp)
      } catch(e) {}
    }
  } catch(e) {}
  return events
}
function triggerInject() {
  try {
    const { spawn } = require('child_process')
    spawn('C:\Windows\System32\wscript.exe', [path.join(ROOT, 'spawn_relay.vbs'), path.join(ROOT, 'inject.js')], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
  } catch(e) {}
}

// Subscribe to bus events → push to inter-process queue
bus.on('warning:new', d => pushInterProcess('warning:new', d))
bus.on('dream:complete', d => pushInterProcess('dream:complete', { summary: d.findings?.summary }))
bus.on('persona:updated', d => pushInterProcess('persona:updated', { traits: d.traits?.slice(0,3).map(t=>t.name) }))
bus.on('composer:chain_detected', d => pushInterProcess('composer:chain_detected', d))
bus.on('research:gap_found', d => pushInterProcess('research:gap_found', d))

// Helper: get feedback lookup for warning analysis
function getFeedbackLookup() {
  try {
    const index = require('./index')
    index.init()
    const allMems = index.getAllMemoryKeys()
    const lookup = {}
    for (const m of allMems) {
      lookup[m.key] = {
        effectiveness: m.effectiveness_score || 0.5,
        injected_count: m.injected_count || 0,
        ineffective_count: m.ineffective_count || 0
      }
    }
    return lookup
  } catch(e) { return {} }
}

module.exports = { init, drainInterProcess, pushInterProcess, triggerInject }
