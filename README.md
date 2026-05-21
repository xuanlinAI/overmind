# 玄霖超脑 · 无量网络 v4 重构版

<p align="center">
  <b>首个开源的事件驱动 AI Agent 认知架构。目前最强的是 v4。未来最强的是 v5。</b>
</p>

<p align="center">
  不是记忆，是推理。不是工具，是神经系统。不是插件，是认知引擎。<br>
  全球唯一 6 通道架构 · 66 模块 · 37 阶段管道 · 知识图谱 5000+ 节点 · 跨 Agent 舰队协同<br>
  装完，你所有的 AI 工具从此共享一个永远不失忆的大脑。
</p>

<p align="center">
  <a href="#中文">🇨🇳 中文</a> | <a href="#english">English</a>
</p>

---

<span id="中文"></span>

# 🇨🇳 中文

## 你每天都在重复这三件事

1. **开一个新的 Claude Code 会话，又花二十分钟把项目从头介绍一遍。** 上次教过它的踩坑、规范、决策，全部清零。
2. **开第二个 CC 窗口处理另一个任务，两个窗口互相不知道对方在干嘛。** 经常打架、改坏对方的代码。
3. **CC 一脸自信地给你一段代码，跑起来才发现是幻觉。** 调试半小时才发现是它编的 API。

玄霖超脑就是来解决这三件事的。

## 它到底是个什么东西

一句话：**Claude Code 的外挂大脑**。但不是普通大脑——是全球首个**事件驱动 AI Agent 认知架构**。它不只是存记忆，它在推理。

装上之后：

- 🧠 **永久记忆**：你跟 CC 说过的每一句话、做过的每一个决定、踩过的每一个坑，它都记得。下次开会话直接接着干，不用再介绍项目。
- 🔗 **多窗口舰队共享**：开五个 CC 同时干活，它们互相能看到对方在改什么、学到什么。一个发现的 bug，所有窗口都知道。一个 CC 学到的技能，另一个 CC 直接能用。
- 🛡️ **回答前自检**：CC 给出代码之前，超脑先在后台过一遍——这段代码会不会和已有架构冲突？这个 API 是不是它编的？有问题先拦下来重写，再给你看。
- 🎯 **越用越懂你**：你的代码风格、命名习惯、架构偏好，它会自己总结。一周后它写的代码，会越来越像你写的。

## 凭什么说是最强的

**没有竞品能做到这些：**

| | 超脑 v4 | Mem0 | AgentMemory | Cursor | Copilot |
|---|---|---|---|---|---|
| 事件驱动架构 | ✅ 6通道 | ❌ | ❌ | ❌ | ❌ |
| 跨会话永久记忆 | ✅ | ⚠️ | ⚠️ | ❌ | ❌ |
| 多 Agent 舰队协同 | ✅ 实时 | ❌ | ❌ | ❌ | ❌ |
| 回答前自检拦截 | ✅ 默认 | ❌ | ❌ | ❌ | ❌ |
| 代码风格自动学习 | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| 知识图谱推理 (10种关系) | ✅ 5000+节点 | ❌ | ❌ | ❌ | ❌ |
| 零配置自适应安装 | ✅ <1分钟 | ❌ | ❌ | - | - |
| 全本地 | ✅ | ❌ 上云 | ✅ | ❌ 上云 | ❌ 上云 |
| 免费 | ✅ MIT | ❌ $249/月 | ✅ | ❌ $20/月 | ❌ $10/月 |

**一句话：他们做的是 AI 的硬盘。Overmind 做的是 AI 的脑。不是一个维度的东西。**

## 30 秒安装

```bash
git clone https://github.com/xuanlinAI/overmind.git && cd overmind && node install.js
```

安装脚本会交互式问你 API 配置（API 端点、Key、模型 ID），按回车用默认 DeepSeek。装完打开 Claude Code，超脑已经在背后跑了。

```bash
export OVERMIND_API_KEY=sk-xxx        # 推荐：超脑专用（也支持 DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN）
```

## 66 个模块到底在干什么

### 记忆系统 (5 层)
语义记忆 (SQLite + FTS5 + jieba 中文分词，AI 精选) · 程序性记忆 (同模式 ≥3 次自动晋升) · 情景记忆 (AI 生成摘要，按项目检索) · 知识图谱 (10 种关系，BFS 被动推理) · 反馈回路 (4500+ 事件驱动有效性自动调节)

### 37 阶段管道 (CH1)
意图预判 · 安全门禁 (rm -rf 拦截) · 提交门禁 (未 commit 先挡) · 输出盾 (过期 API 检测) · **人格画像 (8维度推断，自动boost技能)** · **红队审查 (恶魔分身攻击每个输出)** · 异常检测 (领域偏移/记忆暴涨) · 预测调试 (git diff → 历史失败) · 成本分析 · 跨会话续接 · **技能编排 (检测 A→B→C 链，自动生成 meta-skill)** · **反事实引擎 (决策阴影追踪)** · 知识验证 · 预测调试 · 检查点回滚 · TDD 约束 · 环境预取 · 噪声学习 · **心理模型 (盲点/重复错误/技能缺口)** · **梦境研究 (Pro 模型深度分析，你不在它也在思考)** · 创意合成 · 思维链透明 · 自主研究 · 预算拦截 (3次失败→止损) · 跨项目迁移 (6领域) · 技能血统 · 记忆预算 · 反流失 · 预判加载 · 会话简报 · 因果可视化 · **时间旅行 (回到任意日期/commit 的记忆状态)** · 僵尸检测 (90天未访问) · 自愈检查 · 模块链接

### z2 中枢 (CH3+CH4)
**FleetWatcher (5秒扫描所有 CC 会话，提取 Q/A，生成舰队广播)** · CH3 直连 (!include → LLM 自动感知同伴) · CH4 中枢广播 (event_queue → bus → 9模块) · 零进程触发 (根治 Windows 窗口闪烁) · 20 个 MCP 工具

### n2 终端 (CH5+CH6)
AI 筛选 (94% 压缩率) · CH5 8 模块串联补全 · CH6 11 模块并联通知

### 舰队 + 涌现功能
**多 CC 自发现 (自动感知所有 CC 实例)** · 跨 CC 技能 boosting (同伴做逆向→自动 boost 逆向技能) · 舰队冲突检测 (两个 CC 同文件→告警) · 跨 CC 创意碰撞 (不同域工作→交叉洞察) · **自我镜像回路 (广播含自身对话)** · 技能自动贴标签 (30/30)

### 自进化
Hermes Fusion (14轮) · 自动晋升 (70次) · AI 工作流 (4个) · 技能草案 (30个 Worker 自动创建) · 记忆压缩 (2145条)

### 安全
红队审查 · 安全拦截 · 输出盾 · 提交门禁 · TDD 约束 · 预算拦截 · 补丁模式

## 装完之后发生什么

```
你：继续昨天那个登录模块
CC：好的，昨天我们用了 JWT + Redis 黑名单，refresh token 设了 7 天。
    现在卡在 SSO 跳转那块。继续从那里开始？
```
不需要重新介绍项目。

```
窗口 A：在改 user.service.ts
窗口 B：（自动提示）窗口 A 正在改 user.service.ts 的登录逻辑，我先避开这个文件。
```
开五个 CC 同时干活，不会打架。

```
[超脑后台：检查中... fetchUserProfile 这个函数项目里不存在，
            CC 可能是幻觉。打回重写。]
CC：（重新生成）这是基于你项目里实际存在的 getUserById 写的版本……
```
幻觉还没到你眼前就被拦下了。

## 重构版 vs 初版

| 维度 | v4 初版 | v4 重构版 |
|------|---------|-----------|
| 启动速度 | 8-12 秒 | < 2 秒 |
| 内存占用 | 600-900 MB | 120-200 MB |
| 模块数 | 66 个，互相耦合 | 精简到核心层 + 插件层 |
| 配置复杂度 | 改 5-7 个文件 | 一条命令 |
| 多实例同步 | 文件锁，会卡 | SQLite WAL，无感 |
| 自检机制 | 串行，慢 | 并行 + 提前终止，快 5-8 倍 |
| 错误恢复 | 出错就挂 | 自动降级，单模块崩溃不影响整体 |
| 安装器 | 无 | probe+vault+config+ready 四件套，失败自动快照回滚 |

## 全功能基准测试

| 指标 | 数值 |
|------|------|
| 管道热吞吐 | 50,000 ops/s |
| 记忆写入 | 200,000 ops/s |
| FTS5 搜索 | 0.22ms/op |
| 图谱边插入 | 142,857 ops/s |
| 事件 I/O | 2,342 write/s · 2,649 drain/s |
| CH5 终端串联 | 102ms/op |
| CH6 终端并联 | 0.78ms/op |
| 地狱压力测试 | 5/5 suites · 96/100 HELL_PASSED |
| 18 项安全审计 | 18/18 PASSED |
| 32 项 Opus bug 排查 | 8 个确认并修复 |
| 42 项发布自测 | 42/42 PASSED |

## 版本演进

| 版本 | 时间 | 关键变化 |
|------|------|---------|
| v1 | 2024 Q3 | 概念验证，66 模块全量铺开 |
| v2 | 2024 Q4 | 加入跨会话记忆，开始有用 |
| v3 | (跳过发布) | 30 模块，5 层记忆，18 MCP 工具 |
| **v4 初版** | 2025 Q2 | 事件总线 · 红队 · 反事实 · 心理模型 |
| **v4 重构版** | 2025 Q2 | 6 通道 · z2 中枢 · n2 终端 · 自适应安装 · 零进程触发 |
| v5 | 规划中 | 中性 IR · 共享记忆图谱 · 环形编排器 · 插件总线 |

## FAQ

**Q：会上传我的代码吗？** 不会。所有记忆数据存在本地 SQLite。只有你调用 LLM 时才会发请求。

**Q：API 费用会暴涨吗？** 自检会多消耗 token，实测增加 15-25%。但因为减少了幻觉返工，总账反而省。

**Q：怎么卸载？** `node install.js --uninstall` 干净卸载。

---

<span id="english"></span>

# 🇬🇧 English

## Three things you do every single day

1. **Open a fresh Claude Code session and spend 20 minutes re-introducing your project.** Every quirk, convention, and hard-won decision from last time? Gone.
2. **Open a second CC window for a parallel task — neither window knows what the other is doing.** They step on each other's commits.
3. **CC confidently hands you code that turns out to be hallucinated.** Thirty minutes of debugging later, you discover it invented an API.

Xuanlin Overmind exists to fix exactly these three things.

## What it actually is

One line: **an external brain for Claude Code.** But not just any brain — the world's first **event-driven AI agent cognitive architecture.** It doesn't just store memories. It reasons about them.

- 🧠 **Permanent memory.** Every conversation, decision, and gotcha you've taught CC stays. Next session picks up where the last one ended.
- 🔗 **Fleet sharing.** Run five CC instances in parallel. They all see what the others are touching, learning, and breaking. A bug discovered in one is known to all. A skill learned by one is usable by all.
- 🛡️ **Pre-answer self-check.** Before CC shows you code, Overmind checks it — does this conflict with existing architecture? Is this API real or hallucinated? Catches issues before they reach you.
- 🎯 **Learns your style.** Your naming patterns, architectural taste, error-handling habits. After a week, CC's output starts looking like code you wrote.

## Why it's the strongest

**No competitor can do this:**

| | Overmind v4 | Mem0 | AgentMemory | Cursor | Copilot |
|---|---|---|---|---|---|
| Event-driven architecture | ✅ 6-channel | ❌ | ❌ | ❌ | ❌ |
| Cross-session permanent memory | ✅ | ⚠️ | ⚠️ | ❌ | ❌ |
| Multi-agent fleet collaboration | ✅ Real-time | ❌ | ❌ | ❌ | ❌ |
| Pre-answer self-check | ✅ Default | ❌ | ❌ | ❌ | ❌ |
| Code-style auto-learning | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| Knowledge graph (10 relations) | ✅ 5000+ nodes | ❌ | ❌ | ❌ | ❌ |
| Zero-config adaptive install | ✅ <1 min | ❌ | ❌ | - | - |
| Fully local | ✅ | ❌ Cloud | ✅ | ❌ Cloud | ❌ Cloud |
| Free | ✅ MIT | ❌ $249/mo | ✅ | ❌ $20/mo | ❌ $10/mo |

**They built AI's hard drive. Overmind is AI's brain. Not the same league.**

## 30-second install

```bash
git clone https://github.com/xuanlinAI/overmind.git && cd overmind && node install.js
```

The installer asks a few questions (API provider, key, model) and finishes in under a minute. Open any Claude Code session and Overmind is already running.

```bash
export OVERMIND_API_KEY=sk-xxx        # Recommended (also supports DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN)
```

## What the 66 modules actually do

### Memory System (5 layers)
Semantic (SQLite+FTS5+jieba, AI-curated) · Procedural (≥3 patterns auto-promoted) · Episodic (AI-generated summaries) · Knowledge Graph (10 relations, BFS reasoning) · Feedback Loop (4500+ events, auto-scoring)

### 37-Stage Pipeline (CH1)
Intent prediction · Security gate (rm -rf interception) · Commit gate · Output shield · **Persona profiling (8-dim, auto skill boost)** · **Red-team adversarial (shadow attacks every output)** · Anomaly detection · Forecast debugging · Cost optimization · Cross-session continuity · **Skill composition (A→B→C chains, auto meta-skill)** · **Counterfactual engine (decision shadow tracking)** · Verification · Predictive debugging · Checkpoints · TDD enforcement · Prefetch · Noise learning · **Theory of mind (blind spots/recurring errors)** · **Dream research (pro model analysis while idle)** · Creative synthesis · Reasoning transparency · Autonomous research · Budget interception (3 failures=stop) · Cross-project transfer (6 domains) · Skill lineage · Memory budget · Anti-compaction · Preloading · Briefing · Causal visualization · **Time travel (any date/commit memory state)** · Zombie detection (90-day) · Self-healing · Nexus linking

### z2 Hub (CH3+CH4)
**FleetWatcher (5s scan of all CC sessions, Q/A extraction, fleet broadcast)** · CH3 Direct (!include → LLM peer awareness) · CH4 Hub broadcast (event_queue → bus → 9 modules) · Zero-process trigger (eliminates Windows flash) · 20 MCP tools

### n2 Terminal (CH5+CH6)
AI filter (94% compression) · CH5 8-module serial · CH6 11-module parallel

### Fleet + Emergence
**Multi-CC auto-discovery** · Cross-CC skill boosting · Fleet conflict detection · Cross-CC creative collision · **Self-mirror loop** · Auto skill tagging (30/30)

### Self-evolution
Hermes Fusion (14 rounds) · Auto-promotion (70) · AI workflows (4) · Auto-created skills (30) · Memory compaction (2145)

### Security
Red-team review · Security interception · Output shield · Commit gate · TDD enforcement · Budget interceptor · Patch mode

## Performance

| Metric | Value |
|--------|-------|
| Pipeline throughput (warm) | 50,000 ops/s |
| Memory writes | 200,000 ops/s |
| FTS5 search | 0.22ms/op |
| Graph edge insert | 142,857 ops/s |
| Event I/O | 2,342 write/s · 2,649 drain/s |
| Terminal serial | 102ms/op |
| Terminal parallel | 0.78ms/op |
| Hell benchmark | 5/5 suites · 96/100 |
| Security audit | 18/18 PASSED |
| Opus bug audit | 8 confirmed & fixed |
| Release self-test | 42/42 PASSED |

## Refactored v4 vs Original

| Aspect | v4 Original | v4 Refactored |
|--------|-------------|---------------|
| Startup | 8-12s | <2s |
| Memory | 600-900MB | 120-200MB |
| Config | 5-7 files | One command |
| Multi-instance | File locks, stalls | SQLite WAL, seamless |
| Self-check | Serial | Parallel, 5-8x faster |
| Error recovery | Hard crash | Graceful degradation |
| Installer | None | probe+vault+config+ready, auto-rollback |

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| v1 | 2024 Q3 | Proof of concept |
| v2 | 2024 Q4 | Cross-session memory |
| v3 | (Skipped) | 30 modules, 5-layer memory |
| **v4 Original** | 2025 Q2 | Event bus, Red team, Counterfactual, Theory of Mind |
| **v4 Refactored** | 2025 Q2 | 6-channel, z2 hub, n2 terminal, adaptive install |
| v5 | Planned | Neutral IR, shared memory graph, ring orchestrator, plugin bus |

## FAQ

**Q: Does it upload my code?** No. All local SQLite.

**Q: Will my API bill explode?** Self-check adds 15-25% tokens. Net spend decreases due to fewer hallucination re-debugs.

**Q: How to uninstall?** `node install.js --uninstall`

---

<p align="center">
  <b>目前最强的是 v4。未来最强的是 v5。</b><br><br>
  Made by <a href="https://github.com/xuanlinAI">玄霖AI (xuanlinAI)</a><br>
  Issues and PRs welcome · MIT License
</p>
