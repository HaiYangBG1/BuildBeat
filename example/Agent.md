# Agent.md — 简账 全栈总图(AI 会话接手按需读这份)

> 一句话:极简个人记账 Web 应用,单用户,先跑通「记一笔 → 看列表 → 月度报表」。
> 🔴 凭据一律**只标位置、不写值**。

## 0. 架构链路

```
浏览器
  ▼
jz-web(React + Vite,静态托管)
  ▼
jz-api(Node + Express + SQLite,示例 PaaS 单实例)
```

## 1. 文件夹

```
简账/
├── Agent.md / CLAUDE.md / 指挥台.md / contracts/ / design/ / pm/ / scripts/
├── jz-web/        # ★ 前端;详见其 AGENTS.md
└── jz-api/        # ★ 后端 API + SQLite;详见其 AGENTS.md
```

## 2. 基础设施标识(资源变动时更新本节)

| 项 | 值 | 说明 |
|---|---|---|
| 部署平台 | 示例 PaaS(沙盘虚构) | 真项目写平台/区域/应用 ID |
| 入口 | `https://jz.example.com` | 示意域名 |
| 数据库 | SQLite(随 jz-api 数据卷) | 每日备份挂账二期(看板挂账 #2) |

### 凭据位置(🔴 只读取,不外泄、不写值)
- 示例 PaaS 部署 token → 本机 `~/.config/example-paas/token`(600 权限)
- jz-api 运行时 env 实查 → `paas env list jz-api`(示意命令)

## 3. 红线 / 4. 子项目文档索引

(与 [templates/Agent.md](../templates/Agent.md) 一致,沙盘从略;改 jz-web 先读其 `AGENTS.md`,改契约先读 `contracts/PROTOCOL.md`。)
