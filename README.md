# Context Proxy — Claude Code 外挂记忆插件

<p align="center">
  <b>Claude Code 的 Hermes 风格长期记忆系统</b><br>
  跨会话记忆 · AI 自动提炼 · 上下文蒸馏 · 技能强制调度
</p>

<p align="center">
  <a href="#中文">🇨🇳 中文</a> | <a href="#english">English</a>
</p>

---

<span id="中文"></span>

# 🇨🇳 中文

## 这是什么

Context Proxy 是一个 Claude Code 外挂插件，赋予 CC **真正的长期记忆能力**。重启后不再失忆——项目进展、技术决策、你的编码偏好、工具配置、甚至日常闲聊和情绪反馈，全部持久化并可跨会话检索。

**核心理念：** 一个独立的后台 AI 持续监听你的对话，自动提炼有价值的信息，在每次新会话开始时注入精简的上下文——你不需要手动记任何东西。

## 解决什么问题

| 痛点 | 原生 Claude Code | 安装 Context Proxy 后 |
|------|-----------------|----------------------|
| 重启后记忆 | 完全丢失，每次从零开始 | 跨会话持久化，自动注入上次对话的关键知识 |
| CLAUDE.md 膨胀 | 路由规则越写越长（常见 200+ 行） | 精简到 5 行核心规则 |
| Skill 描述加载 | 每轮对话加载 100+ 个 Skill 的完整描述 | CC 不加载 Skill 描述，改为外挂按需推荐 2-3 个 |
| 上下文浪费 | 40%+ 的上下文被固定规则和无关 Skill 占据 | 上下文几乎全部用于实际任务 |
| Skill 使用率 | 依赖用户手动查找和调用 | 外挂 AI 自动匹配并强制调用 |
| 知识积累 | 有价值的讨论、决策、踩坑记录全部丢失 | 自动提取并存入可检索的记忆库 |

## 功能详解

### 1. 三层持久记忆

记忆系统按照从具体到抽象的层次组织，每一层有不同的生命周期和用途。

**语义层（长期事实）**
- 存储位置：SQLite 数据库，FTS5 全文索引 + jieba 中文分词
- 存储内容：技术事实、API 端点、配置细节、用户偏好、项目决策、踩坑记录
- 检索速度：3-4ms（纯函数）/ ~80ms（MCP 端到端），O(log n) 不随数据量线性增长
- 生命周期：永久，但会经历自信度衰减（30 天未访问 ×0.9）

**程序性层（可复用模板）**
- 存储位置：SQLite procedural 表
- 存储内容：可复用的操作工作流——名称、触发条件、步骤序列
- 生成条件：同一操作模式出现 3 次以上，或语义记忆中相似内容超过阈值
- 技能草稿：外挂 AI 检测到工作流后自动生成 SKILL.md 文件

**情景层（对话存档）**
- 存储位置：文件系统，`memory/episodic/` 目录
- 存储内容：每次会话的完整对话摘要和关键片段
- 用途：回溯历史、寻找过去的上下文、训练记忆提炼

### 2. AI 自动提炼（Worker 系统）

Worker 是一个独立的后台进程，由 SessionStart Hook 自动生成，持续运行 8 小时。

**工作流程：**
```
会话进行中，CC 将对话写入 JSONL 文件
    ↓
Worker 每 10 秒检测文件大小变化
    ↓
积累 ≥50 行新对话 或 60 秒无新写入且有数据
    ↓
调用 DeepSeek API（默认 deepseek-chat，可配置）
    ↓
按照 HERMES_PROMPT.md 中的 10 类分类体系提取
    ↓
隐私过滤（手机号、地址、API 密钥值）
    ↓
写入语义记忆 + 程序性模板 + 技能草稿
```

**10 个提取类别：**
1. **技术事实** — API 端点完整 URL、端口号、文件路径、加密算法、配置参数
2. **用户环境** — 安装的软件、版本号、操作系统、网络配置、代理设置
3. **用户偏好** — 编码风格、沟通偏好、工具选择习惯、部署偏好
4. **项目信息** — 项目目标、当前阶段、甲方信息、预期收益、阻塞问题
5. **人物关系** — 提到的角色、特征、与用户的关系
6. **日常与情绪** — 心情、满意度、对什么不满意、有什么计划
7. **决策与原因** — 做了哪些选择、为什么选、放弃了什么方案
8. **知识碎片** — 概念解释、命令用法、工具存在、网站用途
9. **时间地点** — 时间节点、截止日期、周期
10. **数字与金额** — 任何具体数字

### 3. 上下文蒸馏

**CLAUDE.md 精简**
- 删除所有静态路由规则、Skill 映射表、优先级列表
- 保留 5 行核心规则：外挂管理声明、D 盘安装约束、操作确认规则、技能强制调用规则
- 路由逻辑从"查映射表→调 Skill"改为"看 injection.md 推荐→调 Skill"

**Skill 描述去重**
- CC 原生行为：扫描所有 Skill 目录，每轮对话注入所有 Skill 的完整描述
- 改造后：将所有 Skill 文件移出 CC 扫描路径，存入外挂目录
- 外挂替代：启动时检索当前任务最相关的 2-3 个 Skill，注入带核心指令摘要的描述
- 会话中：通过 MCP 工具 `list_skills` 按需搜索任意 Skill

**注入格式（injection.md）:**
```markdown
## 当前任务
{从对话记录中提取的用户第一条消息}

## 项目上下文
{工作目录、顶层文件列表}

## 强制技能调用 — 以下技能必须用 Skill 工具执行，禁止手动替代
- /skill-name — 调用方式: Skill({skill: "skill-name"})
  {技能描述}
  {核心指令摘要}

## 相关记忆
- {记忆1}
- {记忆2}

## 状态
语义N条 技能N个 情景N个
```

### 4. 技能使用率提升

插件通过三个机制确保技能被有效使用：

**机制一：强制调用指令**
- 外挂 AI 匹配到技能后，injection.md 中的格式为"**强制技能调用** —— 必须用 Skill 工具执行，禁止手动替代"
- 每条技能附有调用代码：`Skill({skill: "name"})`
- CLAUDE.md 中规定："当 injection.md 推荐技能时，必须用 Skill 工具调用"

**机制二：动态技能搜索**
- MCP 工具 `list_skills` 支持多词加权检索（113 个技能）
- 查询词命中技能名称/触发词：+3 分；命中描述：+1 分；部分匹配：+0.5 分
- 结果按分数降序返回，最相关的排在最前

**机制三：技能草稿自动生成**
- Worker 在提取过程中检测可复用工作流
- 输出格式为 `{"type": "procedural", "name": "...", "trigger": "...", "steps": [...]}`
- Worker 自动将草稿写入 `skills/all/{name}.md` 文件
- 写入后触发 daemon 重索引，新技能立即可用

### 5. 自进化系统

**自信度评分**
- 每次访问：confidence + 0.03（上限 1.0）
- 30 天未访问：confidence × 0.9
- 自信度 > 0.5 且访问 ≥2 次：触发自动晋升

**自动晋升**
- 语义记忆满足晋升条件 → promotion_count +1，confidence +0.1
- 所有晋升事件记录到 evolution_log

**记忆融合（Hermes Fusion）**
- 每次调用 `hermes_fusion` 工具（或自动触发）：
  - 相似记忆合并去重（相同 key 前缀）
  - 衰减低活跃记忆
  - 触发晋升检查
- 融合日志完整记录

### 6. 模型无关

插件设计为与模型无关——只要目标 API 支持聊天补全格式即可使用。

**默认配置（DeepSeek）：**
- 提取模型：deepseek-chat（性价比高，3-5 秒返回）
- 注入模型（可选）：deepseek-v4-pro[1m]（更强推理）

**切换到其他模型：**
只需修改 `inject.js` 和 `extract_worker.js` 中的 API 端点和模型名：

```javascript
// OpenAI
hostname: 'api.openai.com',
path: '/v1/chat/completions',
model: 'gpt-4o',

// Anthropic
hostname: 'api.anthropic.com',
path: '/v1/messages',
model: 'claude-sonnet-4-20250514',

// 任何 OpenAI 兼容接口（Ollama、vLLM、LocalAI 等）
hostname: 'localhost',
path: '/v1/chat/completions',
model: 'llama3',
```

### 7. MCP 工具（9 个）

| 工具 | 功能 | 参数 |
|------|------|------|
| `search_memory` | 检索语义记忆 | query, limit |
| `save_memory` | 手动保存记忆 | key, content, tags |
| `list_skills` | 搜索技能 | query |
| `create_skill` | 创建 SKILL.md | name, description, content |
| `memory_stats` | 记忆统计 | - |
| `hermes_fusion` | 融合清理 | - |
| `search_procedural` | 搜索程序性模板 | query |
| `search_episodes` | 搜索会话历史 | query |
| `save_episodic` | 保存会话记录 | session_id, summary, task |

### 8. 隐私保护

- **提示词层：** `HERMES_PROMPT.md` 明确要求"不提取隐私信息"
- **代码层：** `privacy_filter.js` 正则过滤手机号、地址、API 密钥值、身份证号
- **存储层：** 所有数据本地 SQLite，不上传云端

## Token 消耗分析

### 每轮对话

| 项目 | 原生 CC | 安装插件后 | 节省 |
|------|---------|-----------|------|
| CLAUDE.md 规则 | ~2000 tokens | ~50 tokens | ~1950 |
| Skill 描述 | ~5000+ tokens | ~100 tokens | ~4900 |
| injection.md 注入 | 0 | ~800 tokens | -800 |
| **每轮净节省** | | | **~6000 tokens** |

一次 20 轮的对话可节省约 **120,000 tokens** 的上下文配额。

### Worker 提取成本

每次增量提取：
- 输入：~15,000 tokens（对话片段）
- 输出：~4,000 tokens（提取结果）
- 成本：约 $0.04（DeepSeek 定价）
- 频率：每 50 行新对话触发一次

## 安装

### 前置要求
- Python 3.10+（用于 daemon MCP 服务）
- Node.js 18+（用于 hook 脚本）
- DeepSeek API key（或其他模型 API key）
- Claude Code（已配置）

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/xuanlinAI/context-proxy.git
cd context-proxy

# 2. 安装依赖
pip install jieba
npm install

# 3. 配置 API key
cp .env.example .env
# 编辑 .env 文件：
# DEEPSEEK_API_KEY=sk-你的key

# 4. 注册 MCP 服务
# 在 ~/.claude/settings.json 的 mcpServers 中添加：
# "ctxproxy": {
#   "type": "stdio",
#   "command": "python",
#   "args": ["D:/你的路径/context-proxy/daemon.py"],
#   "env": {}
# }

# 5. 更新 CLAUDE.md
# 在 ~/.claude/CLAUDE.md 中只保留：
# ---
# 所有长期记忆及技能由外挂 Context Proxy 管理。
# 安装到 D 盘。中文回复。
# 当 injection.md 推荐技能时，必须用 Skill 工具调用，禁止手动替代。
# 执行前需确认的操作：安装/卸载软件包、系统配置修改、删除文件、Git 强制操作。
# !include D:/你的路径/context-proxy/injection.md
# ---

# 6. 重启 Claude Code
```

### 同时更新 .claude.json

CC 同时读取 `.claude.json` 和 `settings.json` 的 MCP 配置。确保两处都有 ctxproxy 注册。

## 安装后最佳实践

### 1. 清空 CLAUDE.md

删除 CLAUDE.md 中所有路由规则（§0-§8）、Skill 映射表、效率规则。外挂 injection.md 会动态注入当前任务相关信息。只保留核心约束。

### 2. 转移 Skill 文件

CC 会自动扫描以下目录并加载所有 SKILL.md 描述：
- `~/.claude/skills/`
- `~/.claude/plugins/cache/*/skills/`
- `~/.claude/plugins/marketplaces/*/plugins/*/skills/`

把这些目录重命名或移走，CC 就不再加载这些 Skill 描述。外挂已将所有 Skill 复制到自己的 `skills/all/` 目录并建立索引。

```bash
# 备份自定义 Skill
mv ~/.claude/skills ~/.claude/skills_bak

# 移走插件缓存中的 Skill 目录
find ~/.claude/plugins/cache -type d -name "skills" -exec mv {} {}_bak \;
find ~/.claude/plugins/marketplaces -type d -name "skills" -exec mv {} {}_bak \;
```

### 3. 配置模型 API

在 `.env` 文件中设置：

```bash
# DeepSeek（默认，推荐性价比）
DEEPSEEK_API_KEY=sk-你的key

# 如果用 OpenAI，改 inject.js 和 extract_worker.js 中的 API 地址
# 如果用 Anthropic，改端点为 /v1/messages 并加 anthropic-version header
# 如果用本地模型，指向 localhost 的 OpenAI 兼容接口
```

### 4. 自定义提示词

`HERMES_PROMPT.md` 完整控制了外挂 AI 的提取行为。你可以修改：
- 添加新的提取类别（如"安全漏洞""性能瓶颈"）
- 调整提取粒度（更多细节 vs 更精简）
- 修改隐私过滤规则
- 调整输出格式

修改后重启 CC，下次 Worker 提取就会用新规则。

### 5. 随时清空上下文

所有对话内容已被外挂 AI 提炼存入记忆库。你可以放心使用 `/clear` 清空上下文——下次会话会自动从记忆库注入相关知识。不需要保留长对话来"记住"讨论过的内容。

### 6. 调整 Worker 行为

`extract_worker.js` 头部有可调参数：
```javascript
const POLL_INTERVAL = 10000    // 检测间隔（毫秒），默认 10 秒
const MIN_NEW_LINES = 50       // 最少新行数才触发提取
const MAX_LIFETIME = 8*60*60*1000  // Worker 存活时间，默认 8 小时
```

## 文件结构

```
context-proxy/
├── README.md              # 本文档
├── LICENSE                # MIT 许可证
├── .env.example           # 环境变量模板
├── .gitignore             # Git 忽略规则
├── HERMES_PROMPT.md       # 外挂 AI 提示词（核心——控制提取行为）
├── plugin.json            # CC 插件描述
│
├── daemon.py              # MCP 服务（Python）—— 9 个工具
├── index.js               # 核心逻辑（Node.js）—— SQLite + FTS5
├── inject.js              # SessionStart Hook —— 生成 injection.md
├── extract_worker.js      # 后台提取 Worker —— 增量监听+AI 提取
├── consolidate.js         # SessionEnd Hook —— 情景记录+融合
├── privacy_filter.js      # 隐私过滤器
│
├── install.js             # 一键安装脚本
├── daemon.js              # Node.js MCP 备选（不推荐——CC 有兼容问题）
├── package.json           # Node.js 依赖声明
│
└── skills/                # 技能目录（不被 CC 扫描——由外挂管理）
    └── all/               # 平铺的所有 SKILL.md 文件
```

## 常见问题

**Q: 会影响 CC 启动速度吗？**
A: SessionStart 注入阶段 ~0.2 秒（纯本地计算，无 API 调用）。Worker 在后台异步启动，不阻塞。

**Q: 记忆数据存在哪？**
A: 全部本地——SQLite 数据库 `memory.db` + 文件系统 `memory/episodic/`。不上传任何云端。

**Q: 支持中文吗？**
A: 全文支持。FTS5 + jieba 中文分词，检索精度和英文同级。

**Q: 怎么备份记忆？**
A: 复制 `memory.db` 和 `memory/` 目录即可。

**Q: 可以用其他 AI 模型吗？**
A: 支持任何 OpenAI 兼容 API。改 `inject.js` 和 `extract_worker.js` 中的 API 端点即可。

**Q: 隐私数据怎么保护？**
A: 双层过滤：提示词层不提取 + 代码层正则拦截。所有数据本地存储。

## 许可证

MIT License — 随意使用、修改、商用。只需保留版权声明。

---

<span id="english"></span>

# 🇬🇧 English

## What is this

Context Proxy is a Claude Code plugin that adds **genuine long-term memory**. No more amnesia after CC restarts — project progress, technical decisions, coding preferences, tool configurations, even casual chats and emotional feedback are all persisted and searchable across sessions.

**Core concept:** A background AI continuously monitors your conversations, automatically extracts valuable information, and injects distilled context at the start of each new session — you never need to manually record anything.

## Problems Solved

| Pain Point | Vanilla CC | With Context Proxy |
|------------|-----------|-------------------|
| Memory after restart | Completely lost, start from zero | Persisted across sessions, auto-injected |
| CLAUDE.md bloat | Hundreds of routing rules | 5 core lines |
| Skill description loading | 100+ full descriptions every turn | CC loads none, proxy recommends 2-3 |
| Context waste | 40%+ static rules/descriptions | Context goes to actual work |
| Skill usage rate | Manual lookup required | AI auto-matches + mandatory invocation |
| Knowledge accumulation | Valuable discussions lost | Auto-extracted into searchable memory |

## Core Capabilities

### Three-Layer Memory
- **Semantic:** SQLite + FTS5 + jieba, O(log n) search, 3-4ms latency
- **Procedural:** Reusable workflow templates, auto-generated from patterns
- **Episodic:** Full conversation archives on filesystem

### AI Auto-Extraction
- Background Worker monitors conversation in real-time
- Triggers every ~50 new lines with 10 extraction categories
- Privacy filter blocks personal data before storage

### Context Distillation
- CLAUDE.md: 260+ lines → 5 lines
- Skills: 100+ pre-loaded → 2-3 on-demand with core instructions
- ~6000 tokens saved per conversation turn

### Model-Agnostic
Works with any OpenAI-compatible API. Swap one config to switch between DeepSeek, OpenAI, Anthropic, or local models.

### 9 MCP Tools
`search_memory` `save_memory` `list_skills` `create_skill` `memory_stats` `hermes_fusion` `search_procedural` `search_episodes` `save_episodic`

## Quick Start

```bash
git clone https://github.com/xuanlinAI/context-proxy.git
cd context-proxy
pip install jieba && npm install
cp .env.example .env  # add your API key
# Register in ~/.claude/settings.json as MCP server
# Add !include to ~/.claude/CLAUDE.md
# Restart CC
```

See the Chinese section above for detailed installation steps and best practices.

## License

MIT — do whatever you want. Just keep the copyright notice.

---

<p align="center">
  Made by <a href="https://github.com/xuanlinAI">玄霖AI (xuanlinAI)</a>
</p>
