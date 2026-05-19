# Xuanlin Overmind

<p align="center">
  <b>CC 的外挂认知引擎</b><br>
  五层记忆 · 知识图谱 · 推理 · 预警 · 自进化
</p>

<p align="center">
  不只是记忆，是推理。
</p>

---

## 这是什么

Xuanlin Overmind 给 Claude Code 加装了一层完整的认知系统。它不是插件——它是引擎。

CC 原生能力：对话关闭，记忆归零。下次打开，从零开始。

安装后：
- **记忆不灭** — 跨会话持久化，自动提炼关键事实
- **知识推理** — 记忆之间自动建立因果图，搜一个带出一串
- **主动预警** — 检测到你正在重复之前的失败模式，拦住你
- **技能学习** — 观察你爱在什么场景用什么技能，下次自动推荐
- **自我进化** — 低效记忆自动淘汰，冲突记忆自动合并，模式自动晋升

---

## 核心系统

### 五层记忆

| 层级 | 技术 | 说明 |
|------|------|------|
| 语义记忆 | SQLite + FTS5 + jieba | 技术事实、决策、偏好，全文检索 |
| 程序性记忆 | 自动晋升 | 可复用工作流模板，同一模式出现 3 次自动生成 |
| 情景记忆 | JSON 存档 | 每次会话的完整摘要，AI 自动生成 |
| 知识图谱 | graph.db | 10 种关系类型，子图遍历，因果推理 |
| 反馈闭环 | 注入→引用→效果 | 全链路追踪记忆效果，自动淘汰低效记忆 |

### 知识图谱（10 种关系）

`depends_on` · `part_of` · `blocked_by` · `causes` · `solves` · `related_to` · `extends` · `conflicts_with` · `alternative_to` · `triggers`

Worker 自动从对话中提取关系建边。注入时，选中的记忆沿图谱扩展——你不问它也给。

### 被动知识推理

这是 Overmind 最独特的隐性能力。工人从对话里自动提取关系，搜到一条记忆时图自动展开关联：

```
"jhsgvYT0 token 签名未知"
  → OAuth 绕过未解决        (blocked_by)
  → RS VM 字节码 235KB      (part_of)
  → mitmproxy 抓了 76 个 token (triggers)
```

这不是记忆搜索，这是推理。你没设计推荐引擎，但每次注入都是一次基于图的联想检索。

### 主动预警

检测到当前任务命中已知的危险路径时，在注入文档中生成 ⚠️ 危险信号：

- 🔴 失败模式 — 曾因同一原因失败 N 次
- ⚠️ 阻塞风险 — 关键节点仍未解决
- ⚡ 潜在冲突 — 两个方案互斥

### 自进化

- **Hermes Fusion** — 衰减+晋升+去重+AI 进化（pro 模型审查高价值记忆，自动合并/淘汰/生成工作流）
- **自信度系统** — 30 天未访问衰减，高效记忆自动晋升
- **技能评分** — invoke_count + recency → quality_score，低效技能自动归档
- **有效期淘汰** — 注入多次无效的记忆自动淘汰

### 优雅降级

每层都有 fallback，不是设计出来的，是实战磨出来的韧性：

- flash AI 超时 → 关键词兜底
- Skill 工具失败 → 自动读文件执行
- SessionEnd Hook 不触发 → Worker 15 分钟空闲自动 consolidate
- 技能偏好冷启动 → 手动种子 + AI 自动积累

### 其他隐性能力

- **跨 CC 窗口技能同步** — Worker 读同一份对话文件，多个 CC 窗口的技能使用互相同步
- **噪音自净化** — 隐私过滤 + 模糊匹配 + 归一化 + 有效期淘汰 = 自动清洗
- **对话考古** — 情景记忆 + 图谱边，能追溯 bug 是怎么一步步被发现的
- **自训练闭环** — Worker 检测 → skill_prefs 积攒 → 技能 AI 选择越来越准

---

## 架构

```
inject.js ──→ injection.md ──→ CC 读取执行
    │              │
    ├─ Phase 0: 图谱预警 (本地, 0ms)
    ├─ Phase 1: lite 注入 (关键词, 0 API)
    ├─ Phase 2: flash AI 三路并行
    │     ├─ 技能选择 (关键词预筛→AI精选)
    │     ├─ 记忆精选 (bigram预筛→AI精选)
    │     └─ 任务分解
    └─ Phase 3: full 注入 (图扩展+反馈+技能)

Worker (30s cycle)
    ├─ 记忆提取 → memory.db
    ├─ 关系提取 → graph.db
    ├─ 技能偏好 → skill_prefs
    └─ SessionEnd 检测

daemon.py (18 MCP 工具)
    ├─ 记忆/技能/图谱 CRUD
    ├─ 自进化 (hermes_fusion)
    ├─ 预警查询 (search_warnings)
    └─ 反馈追踪 (record_feedback)
```

---

## 安装

### 1. 克隆

```bash
git clone https://github.com/xuanlinAI/overmind.git
cd overmind
```

### 2. 依赖

```bash
pip install jieba
npm install
```

### 3. 配置 API Key

```bash
# 设置环境变量（推荐）
export DEEPSEEK_API_KEY=sk-xxx

# 或直接改各文件中的 YOUR_DEEPSEEK_API_KEY 为你的 key
# inject.js, extract_worker.js, consolidate.js, daemon.py
```

### 4. 注册插件

编辑 `~/.claude/settings.json`，加入：

```json
{
  "mcpServers": {
    "ctxproxy": {
      "type": "stdio",
      "command": "python",
      "args": ["/你的路径/overmind/daemon.py"],
      "env": {}
    }
  }
}
```

同时在 `~/.claude/.claude.json` 的 `mcpServers` 中也加入同样的配置。

### 5. 注册 Hooks

编辑 `~/.claude/settings.json`，找到 `hooks` 字段（没有则创建），加入：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/你的路径/overmind/inject.js\""
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/你的路径/overmind/inject.js\""
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/你的路径/overmind/consolidate.js\""
          }
        ]
      }
    ]
  }
}
```

### 6. 配置 CLAUDE.md

删除 `~/.claude/CLAUDE.md` 中所有路由规则、Skill 映射表、效率规则。只保留：

```markdown
所有长期记忆及技能由 Overmind 管理。
安装到你的安装路径。中文回复。
当 injection.md 推荐技能时，必须用 Skill 工具调用，禁止手动替代。
执行前需确认的操作：安装/卸载软件包、系统配置修改、删除文件、Git 强制操作。

!include /你的路径/overmind/injection.md
```

### 7. 重启 Claude Code

---

## 效率最大化指南

### Skill 文件迁移

CC 会自动扫描 `~/.claude/skills/` 下的所有 SKILL.md 并加载完整描述到每轮对话。上百个 skill 会浪费大量上下文。

**做法：**

1. 把你的所有 SKILL.md 复制到 `overmind/skills/all/` 目录下
2. 把 `~/.claude/skills/` 重命名为 `~/.claude/skills_bak/`
3. CC 不再加载 skill 描述，Overmind 按需推荐最相关的 2-3 个

```bash
# 复制技能
cp ~/.claude/skills/*/SKILL.md overmind/skills/all/
# 禁用 CC 原生加载
mv ~/.claude/skills ~/.claude/skills_bak
```

### 首次启动优化

- 第一轮对话注入较慢（AI 正在选择技能和记忆），后续每轮约 4-36 秒
- 技能偏好在 5-10 次会话后会达到较好匹配率
- 自进化在积累 1000+ 条记忆后效果明显

### 模型选择

默认使用 DeepSeek（性价比最高）。切换到 OpenAI 或 Anthropic：改 `inject.js` 和 `extract_worker.js` 中的 API 端点即可。

```javascript
// OpenAI
hostname: 'api.openai.com',
path: '/v1/chat/completions',
model: 'gpt-4o',

// Anthropic
hostname: 'api.anthropic.com',
path: '/v1/messages',
model: 'claude-sonnet-4-20250514',
```

### 手动种子技能偏好

如果 Worker 还没积累足够的偏好数据，可以直接设置：

```bash
# 在 overmind 目录下
节点 -e "
const i = require('./index'); i.init();
i.upsertSkillPref('你的技能名', '任务场景', 0.9);
i.syncSkillPrefsToFile();
"
```

---

## MCP 工具（18 个）

| 工具 | 用途 |
|------|------|
| `search_memory` | FTS5 全文检索，可选 AI 语义精选 |
| `save_memory` | 手动保存语义记忆 |
| `list_skills` | 关键词检索技能库 |
| `create_skill` | 创建新 SKILL.md |
| `memory_stats` | 记忆库统计 |
| `current_context` | 查看当前注入的上下文 |
| `hermes_fusion` | 手动触发自进化 |
| `search_procedural` | 搜索程序性模板 |
| `search_episodes` | 搜索历史会话 |
| `save_episodic` | 保存会话记录 |
| `search_graph` | 图谱搜索，返回关系子图 |
| `expand_keys` | 记忆 key → 图谱扩展 |
| `create_edge` | 手动建立关系边 |
| `graph_stats` | 图谱统计 |
| `search_warnings` | 检测当前任务的危险信号 |
| `record_feedback` | 记录记忆使用反馈 |
| `skill_rankings` | 技能效果排行榜 |
| `skill_prefs` | 查询技能使用偏好 |

---

## FAQ

**会影响 CC 启动速度吗？**
注入阶段 0 API 延迟（lite 版），AI 选择在后台异步运行。

**数据存在哪？**
全部本地 — memory.db + graph.db + memory/ 目录。不上传云端。

**隐私怎么保护？**
双层过滤：HERMES_PROMPT 不提取 + 代码正则拦截。数据全本地。

**支持其他 AI 模型吗？**
支持任何 OpenAI 兼容 API。模型无关，改端点即可。

**怎么备份？**
复制 `memory.db`、`graph.db`、`memory/` 目录。

---

## 许可证

MIT — 玄霖AI (xuanlinAI)

---

# 🇬🇧 English

## What is this

Xuanlin Overmind adds a complete cognitive layer to Claude Code. It's not a plugin — it's an engine.

Vanilla CC: close the session, memory goes to zero. Start fresh every time.

With Overmind:
- **Memory persists** — cross-session with automatic fact extraction
- **Knowledge reasoning** — auto-built causal graph between memories, search one brings up the chain
- **Proactive warnings** — detects repeated failure patterns, warns before you hit the same wall
- **Skill learning** — observes what skills you use for what tasks, recommends accordingly
- **Self-evolution** — ineffective memories decay, conflicting ones merge, patterns auto-promote

**Not just memory. Reasoning.**

## Core Systems

### Five-Layer Memory

| Layer | Tech | Purpose |
|-------|------|---------|
| Semantic | SQLite + FTS5 + jieba | Technical facts, decisions, preferences — full-text search |
| Procedural | Auto-promotion | Reusable workflow templates, generated from repeated patterns |
| Episodic | JSON archives | Complete session summaries, AI-generated |
| Knowledge Graph | graph.db | 10 relation types, subgraph traversal, causal reasoning |
| Feedback Loop | Full pipeline tracking | Injection → reference → outcome, auto-prunes ineffective memories |

### Knowledge Graph (10 relations)

`depends_on` · `part_of` · `blocked_by` · `causes` · `solves` · `related_to` · `extends` · `conflicts_with` · `alternative_to` · `triggers`

The worker auto-extracts relationships from conversations. During injection, selected memories expand through the graph — related knowledge you didn't ask for surfaces automatically.

### Passive Knowledge Reasoning

Overmind's most unique emergent capability. The worker builds relational edges during extraction. When you search for a memory, the graph expands to reveal causal chains:

```
"token signature unknown"
  → OAuth bypass unresolved          (blocked_by)
  → VM bytecode 235KB                (part_of)
  → mitmproxy captured 76 tokens     (triggers)
```

This is not memory search. This is reasoning.

### Proactive Guard

When the graph detects you're approaching known failure paths, injection docs include ⚠️ warnings:

- 🔴 Failure pattern — same cause failed N times before
- ⚠️ Blocked — critical dependency still unresolved
- ⚡ Conflict — two approaches are mutually exclusive

### Self-Evolution

- **Hermes Fusion** — decay + promotion + dedup + AI evolution (pro model reviews top memories, auto-merges/deprecates/generates workflows)
- **Confidence scoring** — 30-day decay, high-confidence auto-promotion
- **Skill scoring** — invoke_count + recency → quality_score, low-quality skills auto-archived
- **Effectiveness pruning** — memories injected multiple times but never helped get removed

### Graceful Degradation

Every layer has a fallback — not by design, but forged through real-world use:

- flash AI timeout → keyword fallback
- Skill tool fails → auto-reads skill file and executes instructions
- SessionEnd hook unreliable → worker auto-detects 15min idle and consolidates
- Skill prefs cold start → manual seeding + AI auto-accumulation

### Other Emergent Capabilities

- **Cross-window skill sync** — multiple CC windows share one transcript, skills sync automatically
- **Noise self-cleaning** — privacy filter + fuzzy matching + normalization + pruning = automatic data quality
- **Conversation archaeology** — episodic memory + graph edges trace how bugs were discovered step by step
- **Self-training loop** — worker detection → skill_prefs accumulation → AI selection gets better over time

## Architecture

```
inject.js ─→ injection.md ─→ CC reads and executes
    │
    ├─ Phase 0: Graph warnings (local, 0ms)
    ├─ Phase 1: Lite injection (keywords, 0 API)
    ├─ Phase 2: flash AI — 3 parallel calls
    │     ├─ Skill selection (keyword pre-filter → AI pick)
    │     ├─ Memory selection (bigram pre-filter → AI pick)
    │     └─ Task decomposition
    └─ Phase 3: Full injection (graph expand + feedback + skills)

Worker (30s cycle)
    ├─ Extract memories → memory.db
    ├─ Extract relations → graph.db
    ├─ Detect skill prefs → skill_prefs
    └─ SessionEnd detection

daemon.py (18 MCP tools)
    ├─ Memory/skill/graph CRUD
    ├─ Self-evolution (hermes_fusion)
    ├─ Warning search (search_warnings)
    └─ Feedback tracking (record_feedback)
```

## Installation

### 1. Clone

```bash
git clone https://github.com/xuanlinAI/overmind.git
cd overmind
```

### 2. Dependencies

```bash
pip install jieba
npm install
```

### 3. API Key

```bash
export DEEPSEEK_API_KEY=sk-xxx
# Or replace YOUR_DEEPSEEK_API_KEY in source files
```

### 4. Register Plugin

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ctxproxy": {
      "type": "stdio",
      "command": "python",
      "args": ["/path/to/overmind/daemon.py"],
      "env": {}
    }
  }
}
```

Also add the same to `~/.claude/.claude.json`.

### 5. Register Hooks

Add to `~/.claude/settings.json` under `hooks`:

```json
{
  "hooks": {
    "SessionStart": [{"matcher": "", "hooks": [{"type": "command", "command": "node \"/path/to/overmind/inject.js\""}]}],
    "UserPromptSubmit": [{"matcher": "", "hooks": [{"type": "command", "command": "node \"/path/to/overmind/inject.js\""}]}],
    "SessionEnd": [{"matcher": "", "hooks": [{"type": "command", "command": "node \"/path/to/overmind/consolidate.js\""}]}]
  }
}
```

### 6. Configure CLAUDE.md

Strip all routing rules and skill mappings. Keep only:

```markdown
All long-term memory and skills managed by Overmind.
Install to your install path. Respond in Chinese.
When injection.md recommends a skill, use the Skill tool — do not skip.
Confirm before: install/uninstall packages, system config changes, file deletion, force git operations.

!include /path/to/overmind/injection.md
```

### 7. Restart Claude Code

## Maximizing Effectiveness

### Skill File Migration

CC auto-loads all SKILL.md descriptions from `~/.claude/skills/` every turn. Move them to Overmind:

```bash
cp ~/.claude/skills/*/SKILL.md overmind/skills/all/
mv ~/.claude/skills ~/.claude/skills_bak
```

Overmind now recommends the 2-3 most relevant skills on demand instead of loading all 100+ descriptions every turn.

### Model Switching

Default: DeepSeek (best cost/performance). To switch:

```javascript
// OpenAI
hostname: 'api.openai.com', path: '/v1/chat/completions', model: 'gpt-4o',

// Anthropic
hostname: 'api.anthropic.com', path: '/v1/messages', model: 'claude-sonnet-4-20250514',
```

Any OpenAI-compatible API works — Ollama, vLLM, LocalAI, etc.

### Seeding Skill Preferences

If the worker hasn't accumulated enough data yet:

```bash
node -e "
const i = require('./index'); i.init();
i.upsertSkillPref('your-skill', 'task category', 0.9);
i.syncSkillPrefsToFile();
"
```

## 18 MCP Tools

| Tool | Purpose |
|------|---------|
| `search_memory` | Full-text search with optional AI semantic ranking |
| `save_memory` | Manually save semantic memory |
| `list_skills` | Keyword-search skill catalog |
| `create_skill` | Create new SKILL.md |
| `memory_stats` | Memory database statistics |
| `current_context` | View current injection context |
| `hermes_fusion` | Manual self-evolution trigger |
| `search_procedural` | Search procedural templates |
| `search_episodes` | Search session history |
| `save_episodic` | Save session record |
| `search_graph` | Graph search, returns subgraph |
| `expand_keys` | Expand memory keys through graph |
| `create_edge` | Manually create graph edge |
| `graph_stats` | Graph statistics |
| `search_warnings` | Detect danger signals for current task |
| `record_feedback` | Record memory effectiveness feedback |
| `skill_rankings` | Skill effectiveness leaderboard |
| `skill_prefs` | Query skill usage preferences |

## FAQ

**Does it slow down CC startup?**
No. Phase 0-1 run instantly (0 API calls). AI selection runs async in background.

**Where is data stored?**
Fully local — memory.db + graph.db + memory/ directory. Nothing uploaded.

**How is privacy protected?**
Dual-layer: HERMES_PROMPT instructs AI not to extract PII, code-level regex blocks phone/address/key patterns.

**Can I use other AI models?**
Yes — any OpenAI-compatible API. Model-agnostic by design.

**How do I backup?**
Copy `memory.db`, `graph.db`, and `memory/` directory.

---

<p align="center">
  Made by <a href="https://github.com/xuanlinAI">玄霖AI (xuanlinAI)</a>
</p>
