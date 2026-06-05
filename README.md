# 玄霖超脑 · 无量网络 v4 重构版

<p align="center">
  <b>66 模块 AI 认知神经系统 · 6 通道架构 · 知识图谱推理 · 红队审查 · 自进化</b>
</p>

<p align="center">
  <a href="#中文">🇨🇳 中文</a> | <a href="#english">English</a>
</p>

<p align="center">
  <b>不是记忆，是推理。不是工具，是神经系统。不是插件，是认知引擎。</b>
</p>

<p align="center">
  🥇 6 通道架构 — 串并联管道 + z2 中枢 + n2 终端<br>
  🥈 零配置自适应安装 — 探针 + 自修复 + 诚实降级<br>
  🥉 零进程触发 — 根治 Windows 窗口闪烁<br>
  🔮 舰队模式 — 多 CC 自发现 + 跨 CC 技能 boosting + 冲突检测<br>
  🧠 66 模块实时互连 — 知识图谱 4500+ 节点 · 10 种关系 · 被动推理
</p>

---

<span id="中文"></span>

# 🇨🇳 中文

## 这是什么

玄霖超脑 v4（无量网络）是 Claude Code 的外挂认知引擎。66 个模块通过 6 条通道 + 事件总线实时互连，形成 AI 界首个认知神经系统。

**它在你不在的时候仍在思考。你写的每行代码先被红队分身攻击才到你面前。你做的每个决策都有"选了另一个会怎样"的阴影追踪。你开的每个 CC 实例都能看到彼此在做什么。**

## 重构版 vs 初版 v4

| 维度 | 初版 v4 | 重构版 v4 |
|------|---------|-----------|
| **安装方式** | 手动配置，Windows 特化 | `node install.js` 一键，全平台自适应 |
| **通道架构** | 2 通道 (串+并) | **6 通道** (CH1-CH6) |
| **管道阶段** | 21 阶段 | **37 阶段** + 量子缓存 |
| **广播模块** | 18 模块 | **48 模块** |
| **AI Agent 适配** | 仅 Claude Code | 自动检测 CC/Cursor/Aider/Codex/Gemini |
| **z2 中枢** | 无 | daemon.py FleetWatcher，5s 舰队广播 |
| **n2 终端** | 无 | communicator AI 筛选 + 串并联后处理 |
| **舰队模式** | 无 | 多 CC 自发现 + 跨 CC 协同 |
| **窗口闪烁** | Windows 多次闪现 | **彻底根治**（零进程触发架构） |
| **自修复** | 无 | vault.js 校验 + 快照回滚 |
| **错误处理** | 裸 except 吞信号 | 全部 `except Exception` + error 监听 |
| **execSync 安全** | 14 处 cmd 窗口 | 全替换 execHidden (spawnSync) |
| **自进化** | Hermes Fusion 基础 | 14 轮融合 + 70 次自动晋升 + 4 个 AI 工作流 |
| **紧急恢复** | 无 | 安装失败自动快照回滚 |

## 版本演进

| 版本 | 代号 | 模块数 | 核心 |
|------|------|--------|------|
| v1 | Context Proxy | 9 | 基础记忆 |
| v2 | Xuanlin Overmind | 9+ | 知识图谱 · 自进化 |
| v3 | (跳过发布) | 30 | 5 层记忆 · 18 MCP 工具 |
| **v4 初版** | **无量网络** | **66** | **事件总线 · 红队 · 反事实 · 心理模型** |
| **v4 重构版** | **无量网络重构** | **66** | **6 通道 · z2 中枢 · n2 终端 · 自适应安装 · 零进程触发** |

## 性能

| 指标 | 数值 |
|------|------|
| 核心延迟 p50 | 0.001ms (60/66 模块亚毫秒) |
| 管道吞吐 | 270 stages/s (缓存命中 ∞) |
| 广播延迟 p99 | <1ms |
| 事件 I/O | 2,500 write/s, 2,800 drain/s |
| 6 通道并发 | 77ms/周期, 0% 崩溃率 |
| 极限压力测试 | 200 周期 · 50 CC · 10,000 事件, 0 错误 |
| 内存占用 | <500MB (66 模块) |
| 日均 API 成本 | $0.05-0.15 |
| 发布自测 | **42/42 PASSED** |

[完整自测说明 → docs/SELF_TEST_CHECKLIST.md](docs/SELF_TEST_CHECKLIST.md)

## 安装

```bash
git clone https://github.com/xuanlinAI/overmind.git && cd overmind && node install.js
```

一条命令完成全部 6 步：

| 步骤 | 内容 |
|:--:|------|
| 1 | **环境探测** — OS/CPU/内存/磁盘/Python/Node/AI Agent 全检 |
| 2 | **安全快照** — 安装前备份所有关键文件 |
| 3 | **完整性校验** — 检测缺失/损坏，自动修复 |
| 4 | **依赖安装** — npm + pip 按需安装 |
| 5 | **配置生成** — .overmind_env.json + hooks/MCP/CLAUDE.md 自动写入 |
| 6 | **冒烟测试** — 6 通道全链验证，失败自动回滚 |

安装后设置 `DEEPSEEK_API_KEY`，重启 Claude Code 即可。

## 六通道架构

```
         ┌── 核心模块 ──┐  ┌── z2中枢 ──┐  ┌── n2终端 ──┐
         │              │  │            │  │            │
串联 ────┤ CH1          │  │ CH3        │  │ CH5         │
         │ 37 stages    │  │ !include   │  │ 8链补全     │
         │ → injection  │  │ → LLM自觉  │  │ → enrich    │
         │              │  │            │  │            │
并联 ────┤ CH2          │  │ CH4        │  │ CH6         │
         │ 48 fire      │  │ event→bus  │  │ bus→11通知  │
         │ → sideFx     │  │ → 9模块    │  │ → modules   │
         └──────────────┘  └────────────┘  └────────────┘
```

## 核心能力 (66 模块)

### 记忆系统 (5层)
- 语义记忆：SQLite + FTS5 + jieba 中文分词，AI 精选
- 程序性记忆：同模式 ≥3 次自动晋升为可复用模板
- 情景记忆：AI 生成会话摘要存档，按项目检索
- 知识图谱：10 种关系类型，BFS 被动推理，因果链追踪
- 反馈回路：4,500+ 事件驱动有效性评分自动调节

### 知识图谱 (10 种关系)
`depends_on → part_of → blocked_by → causes → solves → related_to → extends → conflicts_with → alternative_to → triggers`

4,500+ 节点，4,600+ 边。被动推理：搜索一个记忆自动带出因果链。

### 智能分析 (CH1 37 阶段管道)
意图预判 · 安全门禁 · 提交门禁 · 输出盾 · 人格画像(8维) · 红队审查 · 异常检测 · 预测调试 · 成本分析 · 跨会话续接 · 技能编排 · 反事实引擎 · 知识验证 · 预测调试 · 检查点 · TDD约束 · 环境预取 · 噪声学习 · 心理模型 · 梦境研究(Pro深度分析) · 创意合成 · 思维链透明 · 自主研究 · 预算拦截 · 跨项目迁移(6领域) · 技能血统 · 记忆预算(5维) · 反流失 · 预判加载 · 会话简报 · 因果可视化 · 时间旅行 · 僵尸检测(90天) · 自愈检查 · 模块链接

### z2 中枢 (daemon.py)
- FleetWatcher 5 秒扫描所有 CC 会话，提取 Q/A，生成舰队广播
- CH3 直连：`.fleet_broadcast.md` → `!include` → LLM 自动感知同伴
- CH4 中枢广播：`.event_queue/` → wiring.js drain → bus → 9 模块
- 零进程触发：hook 写 `.trigger.tmp` → daemon 原子 rename → spawn inject.js
- 20 个 MCP 工具，含 `fleet_status` `fleet_peek` 舰队查询

### n2 终端 (communicator.js)
- AI 筛选：flash 模型过滤注入文档，94% 压缩率
- CH5 串联补全：8 模块后处理链
- CH6 并联通知：11 模块并行接收过滤后输出

### 涌现功能
自我镜像回路 · 舰队自省记忆 · 跨 CC 技能 boosting · 舰队冲突检测 · 跨 CC 创意碰撞 · CH4 去重 · 技能自动贴标签 (30/30)

### 技能生态
双阶段选择(AI精选+激进退底) · 偏好学习 · 技能编排(A→B→C链) · 技能热加载 · 技能血统 · 技能市场协议(manifest) · 30 个自创建技能(全标签)

### 安全与质量
红队审查(恶魔分身攻击) · 安全拦截(rm -rf检测) · 输出盾 · 提交门禁 · TDD约束 · 预算拦截(3次止损) · 补丁模式

### 部署与运维
自适应安装器(probe/vault/config/ready) · 舰队模式(多CC共享大脑) · 自愈系统(崩→重启,坏→恢复) · 看门狗(每分钟检查) · 日志旋转(5000行) · 跨平台(Win/Mac/Linux) · 多Agent(CC/Cursor/Aider等8个) · 零窗口闪烁

### MCP 工具 (20 个)
`search_memory` · `save_memory` · `list_skills` · `create_skill` · `memory_stats` · `current_context` · `hermes_fusion` · `search_procedural` · `search_episodes` · `save_episodic` · `search_graph` · `expand_keys` · `create_edge` · `graph_stats` · `search_warnings` · `record_feedback` · `skill_rankings` · `skill_prefs` · **`fleet_status`** · **`fleet_peek`**

## 与竞品对比

| | Xuanlin Overmind v4 | Mem0 | AgentMemory |
|---|---|---|---|
| 部署 | 100% 本地免费 | 云服务 | 本地 |
| 模块数 | **66** | ~8 | ~12 |
| 通道架构 | **6 通道** | 无 | 无 |
| 图推理 | **10 种关系**，免费 | 锁 $249/月 | 基础 BM25 |
| 认知功能 | 预警/预测/进化/梦境/红队/反事实/心理模型/舰队 | 无 | 无 |
| 舰队协同 | **多 CC 自发现+协同** | 无 | 无 |
| 自适应安装 | **全平台零配置** | 手动 | 手动 |
| 日均成本 | **$0.05-0.15** | $8+/天 (Pro) | $0 (本地) |
| 自测覆盖 | **42 项全绿** | 未公开 | 未公开 |

他们做的是 AI 的硬盘。Overmind 做的是 AI 的脑。

---

<span id="english"></span>

# 🇬🇧 English

## What is this

Xuanlin Overmind v4 (Immeasurable Network) is a cognitive engine for Claude Code. 66 modules interconnected through 6 channels and an event bus form the first cognitive nervous system for AI coding agents.

**It thinks while you're away. Every line of code you write is attacked by a red-team shadow before you see it. Every decision you make has a counterfactual shadow tracking "what if you chose differently." Every CC instance you open can see what the others are doing.**

## Refactored v4 vs Original v4

| Dimension | Original v4 | Refactored v4 |
|-----------|-------------|---------------|
| **Install** | Manual config, Windows-only | `node install.js` one-click, cross-platform |
| **Channels** | 2 (serial+parallel) | **6 channels** (CH1-CH6) |
| **Pipeline stages** | 21 | **37** + quantum caching |
| **Broadcast modules** | 18 | **48** |
| **Agent support** | Claude Code only | Auto-detect CC/Cursor/Aider/Codex/Gemini |
| **z2 Hub** | None | daemon.py FleetWatcher, 5s fleet broadcast |
| **n2 Terminal** | None | AI filter + serial/parallel post-processing |
| **Fleet mode** | None | Multi-CC auto-discovery + cross-CC collaboration |
| **Window flash** | Frequent Windows console flash | **Completely eliminated** |
| **Self-repair** | None | vault.js verification + snapshot rollback |
| **Error handling** | Naked except swallowing signals | All `except Exception` + error listeners |
| **execSync safety** | 14 cmd.exe window sites | All replaced with execHidden (spawnSync) |
| **Self-evolution** | Basic Hermes Fusion | 14 fusions + 70 auto-promotions + 4 workflows |
| **Emergency recovery** | None | Install failure → auto snapshot rollback |

## Version History

| Version | Codename | Modules | Highlights |
|---------|----------|---------|------------|
| v1 | Context Proxy | 9 | Basic memory |
| v2 | Xuanlin Overmind | 9+ | Knowledge graph · Self-evolution |
| v3 | (Skipped) | 30 | 5-layer memory · 18 MCP tools |
| **v4 Original** | **Immeasurable Network** | **66** | **Event bus · Red team · Counterfactual · Theory of mind** |
| **v4 Refactored** | **Immeasurable Network R2** | **66** | **6-channel · z2 hub · n2 terminal · Adaptive install** |

## Performance

| Metric | Value |
|--------|-------|
| Core latency p50 | 0.001ms (60/66 modules sub-ms) |
| Pipeline throughput | 270 stages/s (∞ with cache hit) |
| Broadcast latency p99 | <1ms |
| Event I/O | 2,500 write/s, 2,800 drain/s |
| 6-channel concurrent | 77ms/cycle, 0% crash rate |
| Extreme stress test | 200 cycles · 50 CC · 10,000 events, 0 errors |
| Memory footprint | <500MB (66 modules) |
| Daily API cost | $0.05-0.15 |
| Release self-test | **42/42 PASSED** |

[Full self-test documentation → docs/SELF_TEST_CHECKLIST.md](docs/SELF_TEST_CHECKLIST.md)

## Installation

```bash
git clone https://github.com/xuanlinAI/overmind.git && cd overmind && node install.js
```

One command completes all 6 steps:

| Step | Description |
|:--:|------|
| 1 | **Environment Probe** — OS/CPU/RAM/Disk/Python/Node/AI Agent detection |
| 2 | **Safety Snapshot** — Backup all critical files before changes |
| 3 | **Integrity Check** — Detect missing/corrupted files, auto-repair |
| 4 | **Dependencies** — npm + pip install as needed |
| 5 | **Config Generation** — .overmind_env.json + hooks/MCP/CLAUDE.md auto-written |
| 6 | **Smoke Test** — Full 6-channel verification, auto-rollback on failure |

Set `DEEPSEEK_API_KEY` after install, restart Claude Code.

## Six-Channel Architecture

```
         ┌── Core Modules ──┐ ┌── z2 Hub ──┐ ┌── n2 Terminal ──┐
         │                  │ │            │ │                 │
Serial ──┤ CH1              │ │ CH3        │ │ CH5             │
         │ 37 stages        │ │ !include   │ │ 8-chain enrich │
         │ → injection      │ │ → LLM      │ │ → enrich doc   │
         │                  │ │            │ │                 │
Parallel ┤ CH2              │ │ CH4        │ │ CH6             │
         │ 48 fire          │ │ event→bus  │ │ bus→11 notify  │
         │ → side effects   │ │ → 9 modules│ │ → modules      │
         └──────────────────┘ └────────────┘ └─────────────────┘
```

## Core Capabilities (66 Modules)

### Memory System (5 Layers)
- **Semantic Memory** — SQLite + FTS5 + jieba Chinese tokenizer, AI-curated selection
- **Procedural Memory** — Patterns occurring ≥3 times auto-promoted to reusable templates
- **Episodic Memory** — AI-generated session summaries, searchable by project
- **Knowledge Graph** — 10 relation types, BFS passive reasoning, causal chain tracking
- **Feedback Loop** — 4,500+ events driving automated effectiveness scoring

### Knowledge Graph (10 Relations)
`depends_on → part_of → blocked_by → causes → solves → related_to → extends → conflicts_with → alternative_to → triggers`

4,500+ nodes, 4,600+ edges. Passive reasoning: searching one memory automatically surfaces its causal chain.

### Intelligent Analysis (CH1 37-Stage Pipeline)
Intent prediction · Security gatekeeper · Commit gate · Output shield · Persona profiling (8-dim) · Red-team adversarial review · Anomaly detection · Forecast debugging · Cost optimization · Cross-session continuity · Skill composition · Counterfactual engine · Knowledge verification · Predictive debugging · Checkpoints · TDD enforcement · Environment prefetch · Noise learning · Theory of mind · Dream research (pro model) · Creative synthesis · Reasoning transparency · Autonomous research · Budget interception · Cross-project transfer (6 domains) · Skill lineage · Memory budgeting (5-dim) · Anti-compaction · Preloading · Session briefing · Causal visualization · Time travel · Zombie detection (90-day) · Self-healing · Module nexus

### z2 Hub (daemon.py)
- FleetWatcher: 5-second scan of all CC sessions, Q/A extraction, fleet broadcast generation
- CH3 Direct: `.fleet_broadcast.md` → `!include` → LLM auto-awareness of peer CCs
- CH4 Hub Broadcast: `.event_queue/` → wiring.js drain → bus → 9 modules
- Zero-process trigger: hook writes `.trigger.tmp` → daemon atomic rename → spawn inject.js
- 20 MCP tools, including `fleet_status` and `fleet_peek`

### n2 Terminal (communicator.js)
- AI Filter: flash model filtering, 94% compression ratio
- CH5 Serial Enrichment: 8-module post-processing chain
- CH6 Parallel Notification: 11 modules receive filtered output simultaneously

### Emergent Capabilities
Self-mirror loop · Fleet self-aware memory · Cross-CC skill boosting · Fleet conflict detection · Cross-CC creative collision · CH4 dedup · Auto skill tagging (30/30)

### Skill Ecosystem
Dual-stage AI selection with aggressive fallback · Preference learning · Skill chain detection (A→B→C) · Hot-reload · Skill lineage · Marketplace protocol · 30 auto-created skills (fully tagged)

### Security & Quality
Red-team adversarial review (shadow twin attack) · Security interception (rm -rf detection) · Output shield · Commit gate · TDD enforcement · Budget interceptor (3-failure stop-loss) · Patch mode

### Deployment & Operations
Adaptive installer (probe/vault/config/ready) · Fleet mode (multi-CC shared brain) · Self-healing (crash→restart, corrupt→recover) · Watchdog (per-minute checks) · Log rotation (5,000 lines) · Cross-platform (Win/Mac/Linux) · Multi-agent (CC/Cursor/Aider + 5 more) · Zero window flash

### MCP Tools (20)
`search_memory` · `save_memory` · `list_skills` · `create_skill` · `memory_stats` · `current_context` · `hermes_fusion` · `search_procedural` · `search_episodes` · `save_episodic` · `search_graph` · `expand_keys` · `create_edge` · `graph_stats` · `search_warnings` · `record_feedback` · `skill_rankings` · `skill_prefs` · **`fleet_status`** · **`fleet_peek`**

## vs Competitors

| | Xuanlin Overmind v4 | Mem0 | AgentMemory |
|---|---|---|---|
| Deployment | 100% local, free | Cloud service | Local |
| Modules | **66** | ~8 | ~12 |
| Channel architecture | **6 channels** | None | None |
| Graph reasoning | **10 relations**, free | Locked behind $249/mo | Basic BM25 |
| Cognitive functions | Warning/Prediction/Evolution/Dream/Red-team/Counterfactual/ToM/Fleet | None | None |
| Fleet collaboration | **Multi-CC auto-discovery** | None | None |
| Adaptive install | **Cross-platform, zero-config** | Manual | Manual |
| Daily cost | **$0.05-0.15** | $8+/day (Pro) | $0 (local) |
| Self-test coverage | **42 items all-green** | Unknown | Unknown |

They built AI's hard drive. Overmind is AI's brain.

## Platform Compatibility

| Agent | Status |
|-------|--------|
| Claude Code | ✅ Native |
| Cursor | ✅ Adapted (auto-detect) |
| Aider | ✅ Adapted (auto-detect) |
| Hermes Agent | ✅ Adapter |
| Codex CLI | ✅ Adapter |
| Gemini CLI | ✅ Adapter |
| OpenClaw | ✅ Adapter |

---

<p align="center">
  Made by <a href="https://github.com/xuanlinAI">玄霖AI (xuanlinAI)</a>
</p>
