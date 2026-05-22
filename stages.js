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
pipeline.register({ name: 'fleet_reporter', phase: 'inject', priority: 103, run: (ctx) => { try { const m=require('./fleet_reporter'); return m.report() } catch(e){return null} } })

pipeline.register({ name: 'briefing', phase: 'inject', priority: 105, run: (ctx) => { try { const b=require('./briefing'); return b.format(b.generate(null,[],[])) } catch(e){return null} } })
pipeline.register({ name: 'deadcode', phase: 'inject', priority: 120, cacheKey:'dead', run: (ctx) => { try { const d=require('./deadcode'); const r=d.scan(ctx.index); return r&&r.zombies>0?d.format(r):null } catch(e){return null} } })

// ═══ z2 EXPANDED STAGES — 16 more modules in serial pipeline ═══

pipeline.register({ name: 'intent', phase: 'inject', priority: 4, run: (ctx) => { try { const m=require('./intent'); const r=m.predict(ctx.userTask||''); if(!r||!r.task_hint)return null; return `## 🎯 意图预判\n- 任务类型: ${r.task_hint}\n- 置信度: ${Math.round((r.confidence||0)*100)}%\n- 信号: ${(r.signals||[]).slice(0,3).join(', ')}\n- 时段模式: ${r.time_mode||''}` } catch(e){return null} } })

pipeline.register({ name: 'shield', phase: 'inject', priority: 8, run: (ctx) => { try { const m=require('./shield'); const v=m.verify(ctx.index); return v&&v.flags?.length>0 ? m.formatShield(v) : null } catch(e){return null} } })

pipeline.register({ name: 'red_team', phase: 'inject', priority: 15, run: (ctx) => { try { const m=require('./red_team'); const r=m.attack(ctx.userTask||''); return (r&&Object.keys(r).length>0) ? m.format(r) : null } catch(e){return null} } })

pipeline.register({ name: 'forecast', phase: 'inject', priority: 25, run: (ctx) => { try { const m=require('./forecast'); const fc=m.predict(ctx.graph||require('./graph'), []); return fc?.predictions?.length>0 ? m.formatForecast(fc) : null } catch(e){return null} } })

pipeline.register({ name: 'continuity', phase: 'inject', priority: 35, cacheKey:'cont', run: (ctx) => { try { const m=require('./continuity'); const r=m.detect(ctx.index); return (r&&r.is_continuation) ? m.formatContinuity(r) : null } catch(e){return null} } })

pipeline.register({ name: 'counterfactual', phase: 'inject', priority: 42, run: (ctx) => { try { const m=require('./counterfactual'); const r=m.checkDrift(ctx.graph||require('./graph'), ctx.index); return (Array.isArray(r)&&r.length>0) ? m.format(r) : null } catch(e){return null} } })

pipeline.register({ name: 'predictor', phase: 'inject', priority: 52, run: (ctx) => { try { const m=require('./predictor'); const r=m.predict(ctx.index, ctx.graph||require('./graph')); return (r&&r.predictions&&r.predictions.length>0) ? m.formatPrediction(r) : null } catch(e){return null} } })

pipeline.register({ name: 'noiselearner', phase: 'inject', priority: 62, cacheKey:'noise', run: (ctx) => { try { const m=require('./noiselearner'); const patterns=m.loadPatterns(); const keys=Object.keys(patterns||{}); return keys.length>0 ? `## 🔇 噪声模式\n${keys.length} 个已学噪声模式: ${keys.slice(0,5).join(', ')}` : null } catch(e){return null} } })

pipeline.register({ name: 'synthesizer', phase: 'inject', priority: 72, run: (ctx) => { try { const m=require('./synthesizer'); const r=m.synthesize(ctx.index); return (r&&r.syntheses&&r.syntheses.length>0) ? m.formatSyntheses(r) : null } catch(e){return null} } })

pipeline.register({ name: 'reason', phase: 'inject', priority: 78, run: (ctx) => { try { const m=require('./reason'); const skills=ctx.skills||[]; const mems=ctx.mems||[]; const e1=skills.length>0?m.explainSkills(skills):null; const e2=mems.length>0?m.explainMemories(mems):null; return e1||e2 ? `## 💭 选择理由\n${(e1||'')+(e2||'')}` : null } catch(e){return null} } })

pipeline.register({ name: 'lineage', phase: 'inject', priority: 92, run: (ctx) => { try { const m=require('./lineage'); const skills=ctx.skills||[]; const lines=skills.map(s=>{try{return m.trace(s.name)}catch(e){return null}}).filter(Boolean); return lines.length>0 ? m.formatLineage(lines) : null } catch(e){return null} } })

pipeline.register({ name: 'budget_pipe', phase: 'inject', priority: 97, run: (ctx) => { try { const m=require('./budget'); const r=m.analyze(ctx.index); return r ? m.formatBudget(r) : null } catch(e){return null} } })

pipeline.register({ name: 'preload_pipe', phase: 'inject', priority: 102, run: (ctx) => { try { const m=require('./preload'); const r=m.preload(process.cwd(), ctx.userTask||''); return (r&&r.preload) ? m.formatPreload(r) : null } catch(e){return null} } })

pipeline.register({ name: 'causalviz', phase: 'inject', priority: 108, cacheKey:'causal', run: (ctx) => { try { const m=require('./causalviz'); const g=ctx.graph||require('./graph'); const idx=ctx.index; const keys=idx.getAllMemoryKeys ? idx.getAllMemoryKeys().slice(0,10).map(k=>k.key) : []; const r=m.visualize(g, keys); return r ? m.formatCausal(r) : null } catch(e){return null} } })

pipeline.register({ name: 'healer', phase: 'inject', priority: 125, cacheKey:'heal', run: (ctx) => { try { const m=require('./healer'); const r=m.runHealthCheck(); return r ? `## 🩺 自愈检查\n${JSON.stringify(r)}` : null } catch(e){return null} } })

pipeline.register({ name: 'nexus_pipe', phase: 'inject', priority: 130, run: (ctx) => { try { const m=require('./nexus'); return `## 🔗 模块链接\nnexus watcher active: ${m.autoWatch ? 'yes' : 'no'}` } catch(e){return null} } })

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
