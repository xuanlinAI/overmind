const { execSync, spawn } = require('child_process')
const fs = require('fs'), path = require('path')
const os = require('os')

const ROOT = path.dirname(__filename)
const HOME = os.homedir()
const SETTINGS_FILE = path.join(HOME, '.claude', 'settings.json')
const CLAUDE_MD = path.join(HOME, '.claude', 'CLAUDE.md')
const PROBE = require('./.overmind/installer/probe')
const VAULT = require('./.overmind/installer/vault')
const CONFIG = require('./.overmind/installer/config')
const READY = require('./.overmind/installer/ready')
const LOGGER = require('./.overmind/installer/lib/logger')
const BACKUP = require('./.overmind/installer/lib/backup')
const PLATFORM = require('./.overmind/installer/lib/platform')

async function main() {
  const session = LOGGER.startSession('install')
  let snapshotHandle = { files: [] }
  let probeReport = null

  try {
    // ═══════════════════════════════════════════════════════
    // Step 1: PROBE — 探测环境
    // ═══════════════════════════════════════════════════════
    LOGGER.step(1, '环境探测')
    probeReport = await PROBE.probe()
    console.log('')
    console.log('  OS:      ' + probeReport.os.platform + ' ' + probeReport.os.release + ' (' + probeReport.cpu.cores + '核, ' + probeReport.memory.totalGB + 'GB)')
    console.log('  Node:    ' + probeReport.node.version + (probeReport.node.sufficient ? ' ✅' : ' ❌ too old'))
    console.log('  Python:  ' + (probeReport.python.found ? probeReport.python.version + ' (' + probeReport.python.executable + ')' : '❌ not found'))
    console.log('  Disk:    ' + probeReport.disk.freeGB + 'GB free' + (probeReport.disk.sufficient ? ' ✅' : ' ⚠️ low'))
    console.log('  Agents:  ' + (probeReport.agents?.claudeCode?.detected ? 'CC✅ ' : '') + (probeReport.agents?.cursor?.detected ? 'Cursor✅ ' : '') + (probeReport.agents?.aider?.detected ? 'Aider✅ ' : ''))
    if (probeReport.blockers.length > 0) {
      console.log('')
      console.log('  ⚠️  BLOCKERS:')
      probeReport.blockers.forEach(b => console.log('    - [' + b.code + '] ' + b.message))
      if (probeReport.blockers.some(b => b.code === 'NODE_TOO_OLD')) {
        console.log('')
        console.log('  安装无法继续。请升级 Node.js 到 v18+ 后重试。')
        process.exit(1)
      }
    }

    // ═══════════════════════════════════════════════════════
    // Step 2: SNAPSHOT — 快照关键文件
    // ═══════════════════════════════════════════════════════
    LOGGER.step(2, '兼容性快照')
    const manifest = VAULT.loadManifest()
    const criticalPaths = manifest.entries
      .filter(e => e.criticalFor?.includes('claude-code') && (e.platforms.includes('all') || e.platforms.includes(process.platform)))
      .map(e => e.path)
    snapshotHandle = { files: await VAULT.snapshot(criticalPaths) }
    console.log('  ✅ ' + snapshotHandle.files.length + ' 个关键文件已快照')

    // ═══════════════════════════════════════════════════════
    // Step 3: VAULT — 完整性校验 + 修复
    // ═══════════════════════════════════════════════════════
    LOGGER.step(3, '完整性校验')
    const verifyReport = await VAULT.verify({ repair: true, backupBeforeRepair: true, skipUserFiles: true })
    if (verifyReport.fixed.length > 0) console.log('  🔧 已修复 ' + verifyReport.fixed.length + ' 个文件: ' + verifyReport.fixed.join(', '))
    if (verifyReport.warnings.length > 0) console.log('  ⚠️  ' + verifyReport.warnings.length + ' 个警告')
    if (verifyReport.unrecoverable.length > 0) {
      verifyReport.unrecoverable.forEach(u => console.log('  ❌ 不可修复: ' + u.path + ' — ' + u.reason))
      console.log('  安装无法继续。')
      process.exit(1)
    }
    console.log('  ✅ 完整性通过')

    // ═══════════════════════════════════════════════════════
    // Step 4: DEPENDENCIES
    // ═══════════════════════════════════════════════════════
    LOGGER.step(4, '依赖安装')
    try {
      execSync('npm install better-sqlite3 --save', { cwd: ROOT, stdio: 'pipe', timeout: 60000 })
      console.log('  ✅ better-sqlite3')
    } catch (e) { console.log('  ⚠️ npm install: ' + (e.stderr?.toString() || e.message).substring(0, 60)) }
    if (probeReport.python.found && !probeReport.python.hasJieba) {
      try {
        execSync('"' + probeReport.python.path + '" -m pip install jieba', { cwd: ROOT, stdio: 'pipe', timeout: 60000 })
        console.log('  ✅ jieba installed')
      } catch (e) { console.log('  ⚠️ jieba install failed (非关键)') }
    }
    try { require('./index').init(); require('./index').ensureMemoryDirs(); require('./graph').init(); console.log('  ✅ memory.db + graph.db'); }
    catch (e) { console.log('  ⚠️ DB init: ' + e.message); }

    // ═══════════════════════════════════════════════════════
    // Step 5: CONFIG + INTEGRATION — 生成配置 + 写 hook/MCP/CLAUDE.md
    // ═══════════════════════════════════════════════════════
    LOGGER.step(5, '配置生成与集成写入')
    const envConfig = CONFIG.build(probeReport)
    CONFIG.write(envConfig)
    console.log('  ✅ .overmind_env.json 已生成 (mode: ' + envConfig.mode + ')')

    // MCP server
    let settings = {}
    if (fs.existsSync(SETTINGS_FILE)) { try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) } catch (e) {} }
    BACKUP.create(SETTINGS_FILE)
    settings.mcpServers = settings.mcpServers || {}
    settings.mcpServers.ctxproxy = {
      type: 'stdio', command: probeReport.python.found ? (PLATFORM.isWindows ? 'pythonw' : 'python3') : 'python',
      args: [path.join(ROOT, 'daemon.py')], env: {}
    }
    console.log('  ✅ MCP ctxproxy: ' + settings.mcpServers.ctxproxy.command)

    // Hooks — trigger file architecture
    settings.hooks = settings.hooks || {}
    const isWin = PLATFORM.isWindows
    const triggerCmd = isWin
      ? `pythonw -c "open('${ROOT.replace(/\\/g, '/')}/.trigger_inject.tmp','w').close()"`
      : `node "${ROOT}/inject.js" &`
    const triggerConsolidate = isWin
      ? `pythonw -c "open('${ROOT.replace(/\\/g, '/')}/.trigger_consolidate.tmp','w').close()"`
      : `node "${ROOT}/consolidate.js" &`
    const hook = (cmd) => [{ matcher: '', hooks: [{ type: 'command', command: cmd, async: true }] }]
    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = hook(triggerCmd)
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = hook(triggerCmd)
    if (!settings.hooks.SessionEnd) settings.hooks.SessionEnd = hook(triggerConsolidate)
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
    console.log('  ✅ Hooks 已配置 (trigger file architecture)')

    // CLAUDE.md
    BACKUP.create(CLAUDE_MD)
    const injPath = path.join(ROOT, 'injection.md').replace(/\\/g, '/')
    const fleetPath = path.join(ROOT, '.fleet_broadcast.md').replace(/\\/g, '/')
    const includeInj = `!include ${injPath}`
    const includeFleet = `!include ${fleetPath}`
    let currentMD = fs.existsSync(CLAUDE_MD) ? fs.readFileSync(CLAUDE_MD, 'utf-8') : ''
    if (!currentMD.includes('Xuanlin Overmind') && !currentMD.includes('玄霖超脑')) {
      if (currentMD.trim()) BACKUP.create(CLAUDE_MD)
      const header = `所有长期记忆及技能由玄霖超脑 (Xuanlin Overmind) 管理。\n当 injection.md 推荐技能时，必须用 Skill 工具调用，禁止手动替代。\n执行前需确认的操作：安装/卸载软件包、系统配置修改、删除文件、Git 强制操作。\n\n${includeInj}\n${includeFleet}\n\n`
      currentMD = header + currentMD
    } else if (!currentMD.includes(includeInj)) {
      currentMD = currentMD.replace(/!include.*injection\.md/g, includeInj + '\n' + includeFleet)
      if (!currentMD.includes(includeInj)) currentMD = includeInj + '\n' + includeFleet + '\n\n' + currentMD
    }
    fs.writeFileSync(CLAUDE_MD, currentMD, 'utf-8')
    console.log('  ✅ CLAUDE.md 已更新')

    // VBS files — restore if missing (Windows only)
    if (isWin) {
      const vbsFiles = ['inject_launcher.vbs', 'consolidate_launcher.vbs', 'spawn_relay.vbs', 'launcher.vbs']
      for (const vf of vbsFiles) {
        const vp = path.join(ROOT, vf)
        if (!fs.existsSync(vp)) {
          const tpl = path.join(__dirname, '.overmind', 'installer', 'templates', 'hook.windows.vbs')
          if (fs.existsSync(tpl)) {
            let content = fs.readFileSync(tpl, 'utf-8')
            if (vf === 'spawn_relay.vbs') {
              content = fs.readFileSync(path.join(__dirname, '.overmind', 'installer', 'templates', 'spawn_relay.vbs'), 'utf-8')
            }
            if (vf === 'launcher.vbs') {
              content = `CreateObject("Wscript.Shell").Run "node ""${ROOT}\\extract_worker.js""", 0, False`
            }
            fs.writeFileSync(vp, content)
          }
        }
      }
      console.log('  ✅ VBS 文件: ' + vbsFiles.filter(f => fs.existsSync(path.join(ROOT, f))).length + '/' + vbsFiles.length)
    }

    // ═══════════════════════════════════════════════════════
    // Step 6: READY — 冒烟测试
    // ═══════════════════════════════════════════════════════
    LOGGER.step(6, '冒烟测试与回归验证')
    console.log('  运行中...')
    const smoke = await READY.run({ timeoutMs: 60000 })
    const ccCheck = await READY.testCCCompat(snapshotHandle.files)

    console.log('  管道: ' + (smoke.tests.find(t => t.name === 'Daemon Import')?.ok ? '✅' : '⚠️') + ' ' +
      'Worker: ' + (smoke.tests.find(t => t.name === 'Worker Start')?.ok ? '✅' : '⚠️') + ' ' +
      'MCP: ' + (smoke.tests.find(t => t.name === 'MCP Registration')?.ok ? '✅' : '⚠️') + ' ' +
      'CLAUDEmd: ' + (smoke.tests.find(t => t.name === 'CLAUDE.md')?.ok ? '✅' : '⚠️'))

    if (!smoke.ok || !ccCheck.ok) {
      console.log('')
      console.log('  ❌ 冒烟/回归失败，正在回滚...')
      if (smoke.failed.length > 0) smoke.failed.forEach(f => console.log('    - ' + f.name + ': ' + f.reason))
      if (ccCheck.regressions.length > 0) ccCheck.regressions.forEach(r => console.log('    - CC回归: ' + (r.path || r.reason)))
      await VAULT.restore(snapshotHandle.files)
      console.log('  ✅ 已回滚到安装前状态')
      process.exit(1)
    }

    // Start Worker
    try {
      const w = spawn('node', [path.join(ROOT, 'extract_worker.js')], { stdio: 'ignore', detached: true, windowsHide: PLATFORM.isWindows })
      w.on('error', () => {})
      w.unref()
      console.log('  ✅ Worker 已启动')
    } catch (e) { console.log('  ⚠️ Worker: ' + e.message); }

    // Summary
    console.log('')
    console.log('  ═══════════════════════════════════════')
    console.log('  ✅ Xuanlin Overmind v4 安装完成!')
    console.log('  ═══════════════════════════════════════')
    console.log('')
    if (envConfig.mode !== 'full') {
      console.log('  ⚠️  运行模式: ' + envConfig.mode.toUpperCase())
      if (envConfig.features.disabled.length > 0) console.log('  已禁用: ' + envConfig.features.disabled.map(f => f.id).join(', '))
      console.log('')
    }
    console.log('  1. 设置 API key: export DEEPSEEK_API_KEY=sk-xxx')
    console.log('  2. 重启 Claude Code')
    console.log('  3. 输入任意内容 — 应看到超脑注入')
    console.log('')
    console.log('  GitHub: https://github.com/xuanlinAI/overmind')

    LOGGER.success('安装完成', { mode: envConfig.mode })
    LOGGER.endSession()

  } catch (err) {
    LOGGER.error('安装异常', err.message)
    if (snapshotHandle.files.length > 0) {
      console.log('  正在回滚...')
      await VAULT.restore(snapshotHandle.files).catch(e => console.log('  回滚失败: ' + e.message))
    }
    console.log('  ❌ 安装失败: ' + err.message)
    process.exit(1)
  }
}

main()
