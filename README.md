# 玄霖超脑 · 无量网络 v4

<p align="center">
  <b>66 模块 AI 认知神经系统 · 红队对抗审查 · 反事实推理 · 预测式调试 · 自进化</b>
</p>

<p align="center">
  <a href="#中文">🇨🇳 中文</a> | <a href="#english">English</a>
</p>

<p align="center">
  <b>不是记忆，是推理。不是工具，是神经系统。</b>
</p>

<p align="center">
  🥇 红队审查 — 每个输出先被恶魔分身攻击，你只看到幸存者<br>
  🥈 梦境阶段 — AI 在你不在的时候自己分析记忆库<br>
  🥉 反事实引擎 — 追踪每个"如果选了另一个"并主动提醒<br>
  🔮 预测式调试 — git diff → 匹配历史失败 → 代码还没跑就预判崩<br>
  🧠 66 模块实时互连 — 15 条事件流 · 并行广播 · 毫秒级响应
</p>

---

<span id="中文"></span>

# 🇨🇳 中文

## 这是什么

玄霖超脑 v4（无量网络）不是升级——是觉醒。66 个模块通过 15 条事件流 + 并行广播总线实时互连，形成 AI 界首个认知神经系统。

**你不在了它还在想。你写的每行代码先被恶魔分身攻击才到你面前。你做的每个决策都有"选了另一个会怎样"的阴影追踪。**

## 为什么跳过 v3

v3 开发完成（30 模块，私有库存档），但我们选择跳过公开发布，直接发布 v4。v3 是完整认知系统，v4 让它有了神经系统。我们不发布迭代版，只发布质变版。

## 版本演进

| 版本 | 代号 | 模块数 | 核心 |
|------|------|--------|------|
| v1 | Context Proxy | 9 | 基础记忆 |
| v2 | Xuanlin Overmind | 9+ | 知识图谱 · 自进化 |
| v3 | (跳过发布) | 30 | 5 层记忆 · 18 MCP 工具 |
| **v4** | **无量网络** | **66** | **事件总线 · 红队 · 反事实 · 心理模型 · 并行广播** |
| v5 | 规划中 | — | 技能市场协议 |

## 性能

| 指标 | 数值 |
|------|------|
| 核心延迟 p50 | 0.001ms (60/66 模块亚毫秒) |
| 吞吐量 | 566,000 ops/sec |
| 通信 AI 压缩 | 84% (3296→496 chars) |
| prompt cache 命中 | 99.96% (3.9 亿/173 万) |
| 用户感知延迟 | 0ms (异步注入) |
| 日均 API 成本 | $0.05-0.15 |
| 内存占用 | <500MB (66 模块) |
| 全量基准 | 39/39 PASSED |

[完整基准数据 → benchmarks/](benchmarks/) | [外部复现指南 → REPRODUCE.md](REPRODUCE.md)

## 安装

```bash
git clone https://github.com/xuanlinAI/overmind.git && cd overmind && node install.js
```

一条命令搞定：安装依赖 → 初始化数据库 → 注册 MCP + Hooks → 更新 CLAUDE.md → 启动 Worker。设置 LLM API key 后重启 CC 生效。

## 核心能力 (66 模块)

### 记忆系统
- 语义记忆：SQLite + FTS5 + jieba 中文分词
- 程序性记忆：同模式 ≥3 次自动晋升
- 情景记忆：AI 生成会话摘要存档
- 记忆压缩：同主题合并为高阶节点
- Git 锚定：每条记忆绑定 commit hash
- 记忆预算：5 维评分自动归档低价值记忆
- 僵尸检测：90 天未访问标记，只报告不删除
- 时间旅行：回到任意日期/commit 的记忆状态

### 知识图谱
- 11 种关系：depends_on / part_of / blocked_by / causes / solves / mitigates / related_to / extends / conflicts_with / alternative_to / triggers
- 被动推理：搜索一个记忆自动带出因果链
- 因果链追踪：exposure / outcome / failure_rate
- 图谱扩展：BFS 自动展开邻居节点

### 智能分析
- 主动预警：blocked_by / conflicts_with / causes 实时检测
- 记忆预测：因果链 → 成功率 + 缓解建议
- 预测式调试：git diff → 匹配历史失败模式 → 预判 bug
- 异常检测：领域偏移 / 时间异常 / 记忆暴涨 / 技能偏离
- 人格画像：8 维度推断，自动 boost 匹配技能
- 心理模型：建立你的认知画像——盲点 / 重复错误 / 技能缺口
- 反事实引擎：阴影时间线——追踪每个决策的"如果选了另一个"
- 自主研究：Worker 空闲 5min 分析失败/矛盾/方案/缺口
- 梦境阶段：Worker 空闲 10min，pro 模型深度分析融合+裁决+预测
- 创意合成：跨领域记忆碰撞生成待验证假说
- 冲突仲裁：新度 > 有效率 > 置信度 三级自动裁定

### 安全与质量
- **红队审查**：恶魔分身攻击每个输出——你只看到幸存者
- 安全拦截：检测高危操作（rm -rf / force push），交叉查图
- 输出盾：检测过期 API / 坏配置 / 失败方法
- 提交门禁：未提交文件 → CC 主动先 commit
- TDD 约束：改生产代码 → 强制先写会失败的测试
- 预算拦截：同一命令 3 次失败 → 停，写卡点报告
- 补丁模式：改代码不写磁盘 → 生成补丁，选择性生效

### 技能生态
- AI 双阶段选择：关键词预筛 top20 → flash 精选 0-5
- 技能偏好学习：对话自动检测 + 隐式调用识别 + 模糊匹配
- 技能编排：检测链 A→B→C，自动生成 meta-skill
- 技能热加载：事件总线推送 → 下轮立即可选
- 技能血统：完整生命周期追踪
- 技能市场协议：manifest 发布 / 验证 / 订阅（去中心化）

### 上下文优化
- 通信 AI 筛选：flash 精读全量 → 按优先级过滤，压缩 84%
- 增量注入：内容不变跳过写入
- 反流失：compaction 前快照 → 恢复
- 环境预取：文件 / diff / 脚本预加载
- 跨会话连续：检测持续信号 + 未解问题
- 早安简报：离开后回来，自动生成"你不在时发生了什么"
- 跨项目迁移：6 领域分类，跨项目注入提醒
- 意图预判：git + 文件 + 时间 → 预判任务类型
- 思维链透明：展示每个技能/记忆的选择理由

### 部署与运维
- 舰队模式：多 CC 共享同一个大脑
- 舰队协调器：任务锁 + 分工建议，多 CC 不撞车
- 事件总线：内存 pub/sub + 文件队列跨进程
- 并行广播：18 模块同时开火，5s 超时安全阀
- 量子缓存：输入哈希不变 → 复用缓存
- 负空间执行：ctx 不变 → 全结果集复用
- Worker 自适应：活跃 15s / 冷却 60s / 深度 120s
- 自愈系统：Worker 崩→自动重启, DB 坏→WAL 恢复
- 看门狗：外部每分钟检查 Worker 存活
- 多 Agent 适配：Claude Code / Hermes / Cursor / OpenClaw / Codex / Gemini / Aider
- 跨平台：Windows / macOS / Linux
- 配置统一：.overmind_config.json 单文件管全部

### MCP 工具 (18)
search_memory · save_memory · list_skills · create_skill · memory_stats
current_context · hermes_fusion · search_procedural · search_episodes
save_episodic · search_graph · expand_keys · create_edge · graph_stats
search_warnings · record_feedback · skill_rankings · skill_prefs

## 隐性涌现能力

1. **元认知自检** — optimizer + verifier + anomaly + arbitrator 四叠加——引擎维护自己
2. **双轨预测** — dream 慢轨(pro) + forecast 快轨(因果) 互相验证
3. **记忆生命周期** — compress → verifier → arbitrator → timetravel 组成完整生命
4. **技能生态自循环** — composer → prefs → selectSkills → 反馈 → composer
5. **跨机器知识殖民** — fleet → transfer → persona → communicator 自动适应

## 架构

```
inject.js → 串行管道(21 stages) + 并行广播(18 modules) → injection.md → CC
              │                           │
         serial pipeline           Promise.resolve()×18
         (priority ordered)        (simultaneous fire)

Worker (30s cycle) → 记忆提取 + 图关系 + 技能偏好 + 自主研究 + 梦境阶段

daemon.py (MCP) → 18 工具 + Hermes Fusion + AI 进化

Event Bus → 15 条跨模块连接流 + 进程间文件队列
```

## 与竞品对比

| | Xuanlin Overmind v4 | Mem0 | AgentMemory |
|---|---|---|---|
| 部署 | 100% 本地免费 | 云服务 | 本地 |
| 模块数 | 66 | ~8 | ~12 |
| 图推理 | 11 种关系，免费 | 锁 $249/月 | 基础 BM25 |
| 认知功能 | 预警/预测/进化/梦境/红队/反事实/心理模型 | 无 | 无 |
| 核心延迟 p50 | 0.001ms | 200-500ms | 未公开 |
| 日均成本 | $0.05-0.15 | $8+/天(Pro) | $0(本地) |
| cache 命中 | 99.96% | 未公开 | 未公开 |

他们做的是 AI 的硬盘。Overmind 做的是 AI 的脑。

## v5 规划

v5 核心方向：技能市场协议——去中心化技能共享网络。将 Overmind 从工具升维为协议。

---

<span id="english"></span>

# 🇬🇧 English

## What is this

Xuanlin Overmind v4 (Immeasurable Network) is a cognitive engine for Claude Code. It adds a complete cognitive layer: memory, reasoning, proactive warnings, self-evolution, red-team adversarial review, cross-project knowledge transfer, and fleet coordination.

v4 breakthrough: 66 modules connected via 15 event flows + parallel broadcast bus = a nervous system.

## Performance

| Metric | Value |
|--------|-------|
| Core latency p50 | 0.001ms |
| Throughput | 566,000 ops/sec |
| Compression | 84% |
| Cache hit rate | 99.96% |
| Perceived latency | 0ms |
| Daily cost | $0.05-0.15 |
| Memory | <500MB |
| Benchmarks | 39/39 PASSED |

60 of 66 modules are sub-millisecond p50. Full reproducibility guide: [REPRODUCE.md](REPRODUCE.md)

## Installation

```bash
git clone https://github.com/xuanlinAI/overmind.git && cd overmind && node install.js
```

One command: installs dependencies → initializes databases → registers MCP + Hooks → updates CLAUDE.md → starts Worker. Set your LLM API key, restart CC.

## Core Capabilities

66 modules spanning: 5-layer memory · knowledge graph with 11 relation types · passive reasoning · red-team adversarial review · predictive debugging · dream phase (pro model deep analysis) · counterfactual decision timeline · theory-of-mind user model · skill marketplace protocol · fleet orchestrator · self-healing · output shield · and more.

## vs Competitors

Overmind doesn't just store memories. It reasons about them. Mem0 and AgentMemory are AI's hard drive. Overmind is AI's brain.

## Platform Compatibility

| Agent | Status |
|-------|--------|
| Claude Code | ✅ Native |
| Hermes Agent | ✅ Adapter |
| Cursor | ✅ Adapter |
| OpenClaw | ✅ Adapter |
| Codex CLI | ✅ Adapter |
| Gemini CLI | ✅ Adapter |
| Aider | ✅ Adapter |

## v5 Roadmap

Skill Marketplace Protocol — decentralized skill sharing. Elevating Overmind from tool to protocol.

---

<p align="center">
  Made by <a href="https://github.com/xuanlinAI">玄霖AI (xuanlinAI)</a>
</p>
