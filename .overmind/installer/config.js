// config.js — honest configuration, no lying about feature parity
const fs = require('fs');
const path = require('path');
const platform = require('./lib/platform');

const ROOT = path.resolve(__dirname, '..', '..');
const ENV_CONFIG_PATH = path.join(ROOT, '.overmind_env.json');

function determineMode(probeReport) {
  const reasons = [];
  if (!probeReport.node.sufficient) reasons.push(`Node ${probeReport.node.version} too old`);
  if (!probeReport.python.found) reasons.push('Python not found — z2 hub disabled');
  if (!probeReport.memory.sufficient) reasons.push(`Low memory (${probeReport.memory.totalGB}GB)`);

  if (reasons.length === 0) return { mode: 'full', reasons };
  if (reasons.length <= 2) return { mode: 'degraded', reasons };
  return { mode: 'minimal', reasons };
}

function generateFeatureMatrix(probeReport) {
  const enabled = [], degraded = [], disabled = [];
  // Always enabled (pure Node.js)
  enabled.push('ch1_pipeline', 'ch2_broadcast', 'ch5_terminal_serial', 'ch6_terminal_parallel', 'memory_semantic', 'memory_graph');
  // Python-dependent
  if (probeReport.python.found) {
    enabled.push('z2_hub', 'z2_fleet_broadcast', 'ch3_z2_direct', 'ch4_z2_bus');
    if (probeReport.python.hasJieba) enabled.push('chinese_tokenizer');
    else degraded.push({ id: 'chinese_tokenizer', missing: ['jieba'], fallback: 'unicode tokenizer only' });
  } else {
    disabled.push({ id: 'z2_hub', reason: 'Python not found' });
    disabled.push({ id: 'z2_fleet_broadcast', reason: 'Python not found' });
    disabled.push({ id: 'ch3_z2_direct', reason: 'z2 hub required' });
    disabled.push({ id: 'ch4_z2_bus', reason: 'z2 hub required' });
  }
  // Agent integrations
  if (probeReport.agents?.claudeCode?.detected) enabled.push('agent_claude_code');
  else disabled.push({ id: 'agent_claude_code', reason: 'Claude Code not detected' });
  if (probeReport.agents?.cursor?.detected) enabled.push('agent_cursor');
  if (probeReport.agents?.aider?.detected) enabled.push('agent_aider');

  return { enabled, degraded, disabled };
}

function build(probeReport) {
  const modeInfo = determineMode(probeReport);
  const features = generateFeatureMatrix(probeReport);
  const cpu = probeReport.cpu;
  const mem = probeReport.memory;
  const isWin = platform.isWindows;

  return {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    sessionId: probeReport.sessionId,
    platform: {
      os: probeReport.os.platform,
      arch: probeReport.os.arch,
      shell: probeReport.shell.primary,
      pathSeparator: path.sep,
    },
    runtimes: {
      node: { version: probeReport.node.version, major: probeReport.node.major, hasNpm: !!probeReport.node.npmVersion },
      python: probeReport.python.found ? { version: probeReport.python.version, path: probeReport.python.path, hasPythonw: probeReport.python.hasPythonw, hasJieba: probeReport.python.hasJieba } : null,
    },
    mode: modeInfo.mode,
    modeReasons: modeInfo.reasons,
    features,
    integrations: {
      claudeCode: probeReport.agents?.claudeCode || { detected: false },
      cursor: probeReport.agents?.cursor || { detected: false },
      aider: probeReport.agents?.aider || { detected: false },
    },
    params: {
      worker: {
        pollIntervalMs: cpu.cores <= 2 ? 45000 : cpu.cores <= 4 ? 30000 : 15000,
        dreamIntervalHours: mem.totalGB < 4 ? 16 : 8,
        maxConcurrent: Math.max(2, Math.min(cpu.cores * 2, 16)),
      },
      cache: {
        quantumCacheMb: Math.max(4, Math.floor(mem.totalGB * 0.02)),
        ftsCacheSize: Math.max(1000, Math.floor(mem.totalGB * 50)),
      },
      broadcast: { timeoutMs: cpu.cores <= 2 ? 8000 : 5000 },
      pipeline: { batchSize: mem.totalGB < 2 ? 5 : mem.totalGB < 8 ? 20 : 50 },
    },
    paths: {
      root: ROOT,
      triggers: ROOT,
      daemonScript: path.join(ROOT, 'daemon.py'),
      workerScript: path.join(ROOT, 'extract_worker.js'),
      injectScript: path.join(ROOT, 'inject.js'),
      consolidateScript: path.join(ROOT, 'consolidate.js'),
      vbsLauncher: isWin ? path.join(ROOT, 'inject_launcher.vbs') : null,
    },
  };
}

function write(config, targetPath) {
  const tp = targetPath || ENV_CONFIG_PATH;
  fs.writeFileSync(tp, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return tp;
}

function diffWithExisting(newConfig) {
  try {
    const existing = JSON.parse(fs.readFileSync(ENV_CONFIG_PATH, 'utf-8'));
    const diff = { added: [], removed: [], changed: [] };
    const newFeat = new Set((newConfig.features?.enabled || []).map(f => typeof f === 'string' ? f : f.id));
    const oldFeat = new Set((existing.features?.enabled || []).map(f => typeof f === 'string' ? f : f.id));
    newFeat.forEach(f => { if (!oldFeat.has(f)) diff.added.push(f); });
    oldFeat.forEach(f => { if (!newFeat.has(f)) diff.removed.push(f); });
    if (existing.mode !== newConfig.mode) diff.changed.push(`mode: ${existing.mode} → ${newConfig.mode}`);
    return diff;
  } catch (e) {
    return { added: ['all'], removed: [], changed: ['new install'] };
  }
}

module.exports = { build, determineMode, generateFeatureMatrix, write, diffWithExisting };
