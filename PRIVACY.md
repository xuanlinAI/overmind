# Privacy

玄霖超脑 (Xuanlin Overmind) 是本地优先的 AI 认知引擎。本文件说明数据处理方式。

## 数据收集

系统在本地处理以下数据：

| 数据类型 | 说明 | 存储位置 |
|---------|------|---------|
| 语义记忆 | 从对话中提取的关键事实和知识 | `memory.db`（SQLite） |
| 情景记忆 | AI 生成的会话摘要（2-3 句） | `memory/episodic/`（JSON） |
| 程序性记忆 | 自动检测的工作流模式 | `memory.db` |
| 反馈事件 | 记忆使用效果记录（helped/did_not_help） | `memory.db` |
| 注入记录 | 当前会话注入的记忆键列表 | `.prev_injection.json` |

## 数据存储

- **全部本地存储**，无远程服务器
- 对话处理在本地完成，不会完整上传对话
- 数据库和文件存储在项目目录内（`D:\claude\context-proxy\`）

## 第三方服务

| 服务 | 用途 | 发送内容 |
|-----|------|---------|
| DeepSeek API | 会话摘要生成、事实提取 | ≤2000 字符对话片段（仅 consolidate.js） |

- 不发送完整对话历史
- 不使用 Google Analytics、Sentry 或任何遥测服务
- 数据不会出售、共享或用于训练第三方模型

## 用户控制

- 删除 `memory.db` 和 `memory/` 目录清除所有记忆数据
- 停止 daemon 进程（`node platform.js stop`）停用自动处理
- 删除 `.prev_injection.json` 清除注入状态
- 所有数据始终在用户完全控制之下

## 舰队模式

舰队功能仅检测本地 CC 实例数量，不跨网络通信。

---

*最后更新: 2026-05-22*
