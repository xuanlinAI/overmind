// All pipeline stage registrations — loaded once by inject.js / worker / consolidate
const pipeline = require('./pipeline')

// ---- INJECTION STAGES (run in inject.js) ----

pipeline.register({ name: 'morning', phase: 'inject', priority: 3, run: (ctx) => { try { const m=require('./morning'); const b=m.generate(); if(b&&b.away_minutes>=30) return m.format(b); m.touch(); return null } catch(e){return null} } })
pipeline.register({ name: 'gatekeeper', phase: 'inject', priority: 5, run: (ctx) => { try { const g=require('./gatekeeper'); const r=g.scan(ctx.userTask||''); return r?g.format(r):null } catch(e){return null} } })
pipeline.register({ name: 'commit_gate', phase: 'inject', priority: 6, cacheKey:'commit', run: (ctx) => { try { const g=require('./commit_gate'); const r=g.check(); return r?g.format(r):null } catch(e){return null} } })
pipeline.register({ name: 'clarify', phase: 'inject', priority: 7, run: (ctx) => { try { const c=require('./clarify_threshold'); const r=c.check(ctx.userTask||'',ctx.index); return r?c.format(r):null } catch(e){return null} } })

pipeline.register({
  name: 'persona', phase: 'inject', priority: 10,
  run: (ctx) => {
    const persona = require('./persona')
    const profile = persona.analyze(ctx.index)
    if (profile && profile.traits && profile.traits.length > 0) return persona.formatPersona(profile)
    return null
  }
})

pipeline.register({
  name: 'anomaly', phase: 'inject', priority: 20,
  run: (ctx) => {
    const anomaly = require('./anomaly')
    const anom = anomaly.detect(ctx.index, ctx.userTask || '')
    if (anom.length > 0) return anomaly.formatAnomalies(anom)
    return null
  }
})

pipeline.register({
  name: 'optimizer', phase: 'inject', priority: 30,
  run: (ctx) => {
    const optimizer = require('./optimizer')
    const opt = optimizer.analyze()
    if (opt && opt.estimates.total_tokens > 10000) return optimizer.formatReport(opt)
    return null
  }
})

pipeline.register({
  name: 'composer', phase: 'inject', priority: 40,
  run: (ctx) => {
    const composer = require('./composer')
    const chains = composer.detectChains(ctx.index)
    if (chains && chains.chains.length > 0) return composer.formatChains(chains)
    return null
  }
})

pipeline.register({
  name: 'verifier', phase: 'inject', priority: 50,
  run: (ctx) => {
    const verifier = require('./verifier')
    const vf = verifier.verify(ctx.index)
    if (vf && vf.scanned > 0) return verifier.formatVerification(vf)
    return null
  }
})

pipeline.register({
  name: 'prefetch', phase: 'inject', priority: 60,
  run: (ctx) => {
    const prefetch = require('./prefetch')
    const pf = prefetch.prefetch(ctx.cwd || process.cwd(), ctx.userTask || '')
    if (pf && pf.hints.length > 0) return prefetch.formatPrefetch(pf)
    return null
  }
})

pipeline.register({
  name: 'dream', phase: 'inject', priority: 70,
  run: (ctx) => {
    const dream = require('./dream')
    const df = dream.loadDreamFindings()
    if (df) return dream.formatDream(df)
    return null
  }
})

pipeline.register({
  name: 'research', phase: 'inject', priority: 80,
  run: (ctx) => {
    const fs = require('fs'), path = require('path')
    const rfFile = path.join(path.dirname(__filename), '.research_findings.json')
    if (fs.existsSync(rfFile)) {
      const rfData = JSON.parse(fs.readFileSync(rfFile, 'utf-8'))
      const research = require('./research')
      if (rfData && rfData.total_findings > 0) return research.formatFindings(rfData)
    }
    return null
  }
})

pipeline.register({
  name: 'transfer', phase: 'inject', priority: 90,
  run: (ctx) => {
    const transfer = require('./transfer')
    const transRows = transfer.getTransferable(ctx.userTask || ctx.projCtx || '', 5)
    if (transRows.length > 0) return transfer.formatTransferable(transRows)
    return null
  }
})

pipeline.register({
  name: 'anticompact', phase: 'inject', priority: 100,
  run: (ctx) => {
    const anticompact = require('./anticompact')
    const snap = anticompact.loadSnapshot()
    if (snap) {
      const text = anticompact.formatSnapshot(snap)
      anticompact.clearSnapshot()
      return text
    }
    return null
  }
})

pipeline.register({
  name: 'timetravel', phase: 'inject', priority: 110,
  run: (ctx) => {
    // Only active if user asks for specific date/commit
    return null
  }
})

pipeline.register({ name: 'checkpoint', phase: 'inject', priority: 55, run: (ctx) => { try { const c=require('./checkpoint_writer'); return c.format(c.snapshot(ctx.index,ctx.graph)) } catch(e){return null} } })
pipeline.register({ name: 'tdd_enforcer', phase: 'inject', priority: 56, run: (ctx) => { return null } }) // triggered per-file, not per-injection
pipeline.register({ name: 'theory_of_mind', phase: 'inject', priority: 65, cacheKey:'tom', run: (ctx) => { try { const t=require('./theory_of_mind'); const m=t.load(); const w=t.predictErrors(m,ctx.userTask||''); return w.length?t.format(w):null } catch(e){return null} } })
pipeline.register({ name: 'budget_killer', phase: 'inject', priority: 85, run: (ctx) => { try { const b=require('./budget_killer'); const r=b.track(ctx.userTask?.substring(0,30)||'main',null); return r?b.format(r):null } catch(e){return null} } })
pipeline.register({ name: 'briefing', phase: 'inject', priority: 105, run: (ctx) => { try { const b=require('./briefing'); return b.format(b.generate(null,[],[])) } catch(e){return null} } })
pipeline.register({ name: 'deadcode', phase: 'inject', priority: 120, cacheKey:'dead', run: (ctx) => { try { const d=require('./deadcode'); const r=d.scan(ctx.index); return r&&r.zombies>0?d.format(r):null } catch(e){return null} } })

// ---- WORKER IDLE STAGES ----

pipeline.register({
  name: 'research_worker', phase: 'worker_idle', priority: 10,
  run: async (ctx) => {
    const research = require('./research')
    const analysis = research.analyze(ctx.index)
    if (analysis && analysis.total_findings > 0) {
      const fs = require('fs'), path = require('path')
      fs.writeFileSync(path.join(path.dirname(__filename), '.research_findings.json'), JSON.stringify(analysis, null, 2), 'utf-8')
    }
    return analysis
  }
})

pipeline.register({
  name: 'transfer_worker', phase: 'worker_idle', priority: 20,
  run: (ctx) => {
    const transfer = require('./transfer')
    return transfer.extractTransferable(ctx.index)
  }
})

pipeline.register({
  name: 'dream_worker', phase: 'worker_idle', priority: 30,
  run: async (ctx) => {
    const fs = require('fs'), path = require('path')
    const dreamFile = path.join(path.dirname(__filename), '.dream_findings.json')
    const shouldDream = !fs.existsSync(dreamFile) ||
      (Date.now() - fs.statSync(dreamFile).mtimeMs) > 8 * 60 * 60 * 1000
    if (!shouldDream) return null
    const dream = require('./dream')
    return await dream.dream(ctx.index)
  }
})

// ---- SESSION END STAGES ----

pipeline.register({
  name: 'arbitrator', phase: 'session_end', priority: 10,
  run: (ctx) => {
    const arb = require('./arbitrator')
    return arb.resolve(ctx.index, ctx.graph)
  }
})

pipeline.register({
  name: 'compress', phase: 'session_end', priority: 20,
  run: (ctx) => {
    const compr = require('./compress')
    return compr.compress(ctx.index, 3)
  }
})

pipeline.register({
  name: 'anticompact_save', phase: 'session_end', priority: 30,
  run: (ctx) => {
    const anticompact = require('./anticompact')
    const td = require('./util').detectTranscriptDir() || require('path').join(require('os').homedir(), '.claude', 'projects', 'D--claude')
    const compaction = anticompact.detectCompaction(td)
    if (compaction && compaction.detected) {
      anticompact.saveSnapshot(ctx.injectionContent || '', compaction)
    }
    return compaction
  }
})

// ---- FORECAST + WARN stages (graph-based, called from inject.js) ----
// These are invoked directly via graph.js API, no pipeline registration needed

module.exports = { pipeline }
