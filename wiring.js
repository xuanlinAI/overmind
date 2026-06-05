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

  // === CHANNEL 2: PARALLEL BROADCAST — 48 modules simultaneous fire ===
  try {
    const broadcast = require('./broadcast')
    const ROOT = require('path').dirname(__filename)
    const TIMEOUT_MS = 5000

    // All 48 functional modules (excluding infra: broadcast,config,consolidate,daemon,eventbus,
    //   extract_worker,inject,install,pipeline,quantum,stages,template,util,platform,wiring,
    //   clarify_threshold,seed_v3)
    const ALL_MODULES = [
      'adapters','adaptive','anomaly','anticompact','arbitrator','briefing','budget','budget_killer',
      'causalviz','checkpoint_writer','commit_gate','communicator','composer','compress',
      'continuity','counterfactual','deadcode','dream','fleet','forecast','gatekeeper','graph',
      'healer','hypothesis','index','intent','lineage','marketplace','morning','nexus',
      'noiselearner','optimizer','orchestrator','persona','pool','predictor','prefetch','preload',
      'privacy_filter','reason','red_team','research','shield','synthesizer',
      'test_first_enforcer','theory_of_mind','timetravel','transfer','verifier'
    ]

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

      // Module-specific fire adapters — matches each module's export signature
      const adapters = {
        persona:       (m) => m.analyze(idx),
        anomaly:       (m) => m.detect(idx, userTask),
        optimizer:     (m) => m.analyze(),
        composer:      (m) => m.detectChains(idx),
        verifier:      (m) => m.verify(idx),
        prefetch:      (m) => m.prefetch(process.cwd(), userTask),
        dream:         (m) => m.loadDreamFindings(),
        transfer:      (m) => m.getTransferable(userTask, 5),
        checkpoint_writer: (m) => m.snapshot(idx, graph),
        theory_of_mind:(m) => m.update(idx),
        budget_killer: (m) => m.track(userTask.substring(0,30), null),
        deadcode:      (m) => m.scan(idx),
        healer:        (m) => m.checkWorker(),
        counterfactual:(m) => m.checkDrift(graph, idx),
        orchestrator:  (m) => { const id=m.detectInstanceId(); m.register(id); m.heartbeat(id) },
        briefing:      (m) => m.generate(null,[],[]),
        budget:        (m) => m.analyze(idx),
        red_team:      (m) => m.audit ? m.audit(userTask) : null,
        shield:        (m) => m.check ? m.check(idx) : null,
        gatekeeper:    (m) => m.scan ? m.scan(userTask) : null,
        forecast:      (m) => m.predict ? m.predict(graph, []) : null,
        causalviz:     (m) => m.trace ? m.trace(graph, idx) : null,
        arbitrator:    (m) => m.resolve ? m.resolve(idx) : null,
        compress:      (m) => m.run ? m.run(idx) : null,
        continuity:    (m) => m.detect ? m.detect(idx) : null,
        timetravel:    (m) => m.snapshot ? m.snapshot(idx) : null,
        research:      (m) => m.analyze ? m.analyze(idx) : null,
        hypothesis:    (m) => m.generate ? m.generate(idx) : null,
        lineage:       (m) => m.track ? m.track(idx) : null,
        marketplace:   (m) => m.sync ? m.sync() : null,
        intent:        (m) => m.predict ? m.predict(userTask) : null,
        preload:       (m) => m.load ? m.load(idx) : null,
        noiselearner:  (m) => m.learn ? m.learn(idx) : null,
        predictor:     (m) => m.predict ? m.predict(idx, graph) : null,
        reason:        (m) => m.analyze ? m.analyze(userTask) : null,
        synthesizer:   (m) => m.synthesize ? m.synthesize(idx) : null,
        adaptive:      (m) => m.adjust ? m.adjust(idx) : null,
        anticompact:   (m) => m.check ? m.check(idx) : null,
        commit_gate:   (m) => m.check ? m.check() : null,
        test_first_enforcer: (m) => m.enforce ? m.enforce(idx) : null,
        morning:       (m) => m.generate ? m.generate() : null,
        privacy_filter:(m) => m.filter ? m.filter(userTask) : null,
        fleet:         (m) => m.status ? m.status() : null,
        communicator:  (m) => null, // communicator runs in serial pipeline
        nexus:         (m) => m.link ? m.link(idx) : null,
        pool:          (m) => m.health ? m.health() : null,
        adapters:      (m) => m.detect ? m.detect() : null,
        graph:         (m) => null, // graph used directly elsewhere
        index:         (m) => null, // index used directly elsewhere
      }

      for (const name of ALL_MODULES) {
        const adapter = adapters[name]
        fire(name, () => {
          if (adapter) {
            const m = require(`./${name}`)
            return adapter(m)
          }
          // Generic fallback: try init()
          try {
            const m = require(`./${name}`)
            if (typeof m.init === 'function') return m.init()
          } catch(e) {}
        })
      }

      logger(`48 modules fired, task=${userTask.substring(0,40)}`)
    })
  } catch(e) {}

  // === CHANNEL 4: z2 HUB BROADCAST — daemon→event_queue→bus→all 48 modules ===
  bus.on('fleet:broadcast', (data) => {
    // Forward to all modules so each can react to peer CC activity
    try {
      const ROOT = require('path').dirname(__filename)
      const logger = (msg) => { try { require('fs').appendFileSync(require('path').join(ROOT, 'worker.log'), `${new Date().toISOString()} [fleet:broadcast] ${msg}\n`) } catch(e) {} }
      const fleetData = data.data || data
      const instances = fleetData.instances || []

      // Modules that can use fleet data for cross-CC intelligence
      const handlers = [
        { name: 'persona', fn: (m) => { if (m.observeFleet) m.observeFleet(instances) } },
        { name: 'composer', fn: (m) => { if (m.detectChains) m.detectChains(require('./index')) } },
        { name: 'transfer', fn: (m) => { if (m.getTransferable) instances.forEach(i => m.getTransferable(i.topic||'', 3)) } },
        { name: 'anomaly', fn: (m) => { if (m.detectFleetAnomaly) m.detectFleetAnomaly(instances) } },
        { name: 'briefing', fn: (m) => { if (m.generate) m.generate(JSON.stringify(fleetData)) } },
        { name: 'budget_killer', fn: (m) => { if (m.track) m.track(0, [], [], fleetData) } },
        { name: 'counterfactual', fn: (m) => { if (m.checkDrift) m.checkDrift(fleetData) } },
        { name: 'orchestrator', fn: (m) => { try { const id=m.detectInstanceId(); m.heartbeat(id) } catch(e) {} } },
        { name: 'synthesizer', fn: (m) => { if (m.synthesizeFleet) m.synthesizeFleet(instances) } },
      ]

      for (const { name, fn } of handlers) {
        try {
          const m = require(`./${name}`)
          fn(m)
        } catch(e) { logger(`${name}: ${e.message}`) }
      }

      logger(`fleet:broadcast processed — ${instances.length} instances`)
    } catch(e) {}
  })

  // === CHANNEL 6: n2终端 并联广播 — post-filter → bus → all modules ===
  bus.on('terminal:broadcast', (data) => {
    try {
      const ROOT = require('path').dirname(__filename)
      const logger = (msg) => { try { require('fs').appendFileSync(require('path').join(ROOT, 'worker.log'), `${new Date().toISOString()} [terminal] ${msg}\n`) } catch(e) {} }
      if (!data || typeof data !== 'object') { logger('terminal:broadcast received invalid data: '+typeof data); return }
      const filteredDoc = data.content || ''
      const skills = data.skills || []
      const mems = data.mems || []

      // Terminal-specific handlers — modules see what user actually gets
      const handlers = [
        { name: 'persona', fn: (m) => { if (m.observeTerminal) m.observeTerminal(filteredDoc) } },
        { name: 'briefing', fn: (m) => { if (m.generate) m.generate(filteredDoc) } },
        { name: 'lineage', fn: (m) => { if (m.trace) skills.forEach(s => { try { m.trace(s.name||s, filteredDoc) } catch(e) {} }) } },
        { name: 'noiselearner', fn: (m) => { if (m.learn) m.learn(filteredDoc) } },
        { name: 'budget_killer', fn: (m) => { if (m.track) m.track(filteredDoc.length, skills, mems) } },
        { name: 'counterfactual', fn: (m) => { if (m.checkDrift) m.checkDrift(filteredDoc) } },
        { name: 'composer', fn: (m) => { if (m.detectChains) m.detectChains(skills) } },
        { name: 'orchestrator', fn: (m) => { try { m.heartbeat(m.detectInstanceId()) } catch(e) {} } },
        { name: 'synthesizer', fn: (m) => { if (m.synthesize) m.synthesize(filteredDoc) } },
        { name: 'transfer', fn: (m) => { if (m.getTransferable) m.getTransferable(data.userTask||'', 5) } },
      ]

      const TIMEOUT_MS = 3000
      for (const { name, fn } of handlers) {
        Promise.race([
          Promise.resolve().then(() => { try { const m = require(`./${name}`); fn(m) } catch(e) {} }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
        ]).catch(err => logger(`${name}: ${err.message}`))
      }

      logger(`terminal broadcast → 10 modules, doc=${filteredDoc.length}C`)
    } catch(e) {}
  })

  console.log('[v4] Wiring initialized — 6 channels (CH1:37-stage serial | CH2:48-module parallel | CH3:z2直连 | CH4:z2中枢→bus | CH5:n2终端8串 | CH6:n2终端11并)')

  // Drain event_queue → emit latest fleet:broadcast on bus (CHANNEL 4 bridge)
  // With dedup: skip if fleet data unchanged since last drain
  let _lastFleetHash = ''
  try {
    const queued = drainInterProcess(300000)
    let latestFleet = null, latestTs = 0
    for (const evt of queued) {
      if (evt.event === 'fleet:broadcast') {
        const ts = evt.ts || 0
        if (ts > latestTs) { latestTs = ts; latestFleet = evt }
      }
    }
    if (latestFleet) {
      const fleetData = latestFleet.data || latestFleet
      const hash = require('crypto').createHash('md5').update(JSON.stringify(fleetData)).digest('hex')
      if (hash !== _lastFleetHash) {
        _lastFleetHash = hash
        bus.emit('fleet:broadcast', fleetData)
      }
    }
  } catch(e) {}
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
    const child = spawn('node', [path.join(ROOT, 'inject.js')], { stdio: 'ignore', detached: true, windowsHide: true })
    child.on('error', () => {})
    child.unref()
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
