# Xuanlin Overmind v4 发布前自测清单

发布前必须逐项打钩确认。建议在干净虚拟机或 Docker 容器中跑一遍。

## 一、全新安装

- [ ] `git clone --depth=1 <repo> && cd <dir>`
- [ ] 仓库体积 <50MB（`du -sh .`）
- [ ] `node install.js` 全程无 Error/ENOENT/EACCES
- [ ] `.overmind_env.json` 生成成功 (mode 正确)
- [ ] 4 个 VBS 文件存在 (Windows)
- [ ] `~/.claude/settings.json` 含 ctxproxy MCP + trigger hook
- [ ] `~/.claude/CLAUDE.md` 含 injection.md + fleet_broadcast.md include
- [ ] Worker 进程已启动 (`ps aux | grep extract_worker`)
- [ ] daemon.py 可 import 不阻塞 (`python -c "import daemon; print('OK')"`)
- [ ] 设 API key 后重启 CC，首条消息有注入响应

## 二、跨平台

### Windows
- [ ] 无 cmd.exe 窗口闪烁（肉眼观察 5 分钟）
- [ ] 路径使用 `/` 而非 `\\`
- [ ] 文件锁正常（日志旋转不报"being used"）
- [ ] PowerShell 执行策略不阻止安装
- [ ] 长路径 (>260 字符) 不炸

### macOS
- [ ] Apple Silicon 兼容 (arm64)
- [ ] python3 可用 (非 python)
- [ ] .bashrc 修改不丢（zsh 用户）

### Linux
- [ ] Node 18/20/22 三个 LTS 全过
- [ ] systemd / 无 systemd 都支持
- [ ] SELinux 不拦截
- [ ] Docker 容器内可安装

## 三、功能冒烟

- [ ] `node tests/smoke/channels.js` 全部通过
- [ ] 6 通道日志全亮
- [ ] 37 阶段管道完整跑通
- [ ] 48 模块广播覆盖
- [ ] 零进程触发链路正常 (.trigger.tmp → rename → 消费)
- [ ] 日志旋转正常 (5000 行截断)
- [ ] SQL 注入防护 (参数化查询)
- [ ] unhandledRejection 不导致 daemon 退出

## 四、升级 / 复装

- [ ] v4 老用户重装：vault/config 不丢失
- [ ] 脏环境续装：能识别未完成状态
- [ ] daemon 运行时重装：自动 stop → 升级 → 重启
- [ ] hook 不重复注册

## 五、异常环境

- [ ] 磁盘不足 → 明确报错，不留半成品
- [ ] Python 缺失 → 提示安装链接
- [ ] Git 缺失 → 优雅降级
- [ ] 权限不足 → 友好提示，不抛 stack trace
- [ ] 网络隔离 → 完全离线可安装
- [ ] Node < 18 → 明确提示升级
- [ ] 中文/空格路径 → 正常安装
- [ ] 并发安装 → 锁保护，第二个优雅退出

## 六、文档

- [ ] README 含 Requirements / Installation / Quick Start / Troubleshooting / License
- [ ] 所有代码块可执行
- [ ] 无死链 (`markdown-link-check`)
- [ ] 无 TODO/FIXME 残留
- [ ] LICENSE 文件存在
- [ ] CHANGELOG 有 v4 条目

## 七、安全

- [ ] 仓库无 API key (`gitleaks detect`)
- [ ] 历史提交无密钥
- [ ] 无硬编码路径 (/Users/xxx)
- [ ] vault.json 权限 600
- [ ] 日志不含 API key
- [ ] spawn 全有 windowsHide + error 监听
- [ ] 无 execSync 残留
- [ ] SQL 全参数化
- [ ] `npm audit --production` 无 high/critical

## 发布前最终确认

- [ ] `bash scripts/release-check.sh` 全部通过
- [ ] `gitleaks detect --source . --redact` 无发现
- [ ] Git tag 已打
- [ ] CI 三平台全绿
