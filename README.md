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
