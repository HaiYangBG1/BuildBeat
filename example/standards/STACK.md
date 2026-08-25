# STACK.md — 简账技术栈约束

> **Optional**: 本文件由项目拥有；缺失时 BuildBeat 直接跳过，不作为告警或错误。
> **AI write boundary**: 默认只读；用户确认或明确要求技术栈变化后才可修改。
> **Status**: Confirmed

## 声明

| 维度 | 项目约束 | 事实来源 |
|---|---|---|
| Runtime | Node.js 22 LTS | 两仓 package engines 与 CI |
| 包管理器 | npm；各仓提交 package-lock.json | 两仓 lockfile |
| 语言与框架 | React + TypeScript；Node.js API | 两仓 package.json 与源码入口 |
| 数据设施 | SQLite 单机账本 | API schema 与 migration |
| 部署 | Web/API 两个独立 PaaS 服务 | 部署配置与 `ARCHITECTURE.md` |
| CI 与测试 | 单元、API 集成、主流程 E2E | 两仓 CI 与 verify-status suites |
| 供应链 | MIT；依赖必须锁定并过安全检查 | LICENSE、lockfile、CI |

## 可核对基线（bus-check v1）

<!-- buildbeat-stack-baseline:v1
nodeConstraint=22
lockfileKind=package-lock.json
dockerFromImage=n/a
-->

## Rules

- `STACK-MUST-001`: 声明与 package、lockfile、容器或部署配置冲突时只报告漂移，不自动选择一方。
- `STACK-MUST-002`: 更换 Node、React、SQLite、包管理器或部署平台前必须建立 ADR，并同步 `contracts/PROTOCOL.md`。
- `STACK-SHOULD-001`: 版本结论必须能回到仓库配置或运行平台证据。
