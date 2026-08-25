# STACK.md — <项目名> 技术栈约束

> **Optional**: 本文件由项目拥有；缺失时 BuildBeat 直接跳过，不作为告警或错误。
> **AI write boundary**: 默认只读；首次 Bootstrap 只能依据可观测事实起草，用户确认或明确要求技术栈变化后才可修改已确认内容。
> **Status**: Draft

## 声明

| 维度 | 项目约束 | 事实来源 |
|---|---|---|
| Runtime | <运行时及版本约束> | 版本文件 / 包清单 / CI |
| 包管理器 | <包管理器及 lockfile> | lockfile / 包清单 |
| 语言与框架 | <主要语言与框架> | 依赖与源码入口 |
| 数据设施 | <数据库 / 缓存 / 消息设施> | 配置 schema / 部署配置 |
| 部署 | <部署平台 / 容器基线> | Dockerfile / 平台配置 |
| CI 与测试 | <CI 与测试命令> | CI workflow / 测试配置 |
| 供应链 | <许可证 / 供应链约束> | LICENSE / lockfile / 安全策略 |

## 可核对基线（bus-check v1）

下面的注释块是仓库事实的精确比对入口，不从上表自然语言猜值。每个键至少一行；有多个已观测值时重复该键；确认不适用时将唯一值填为 n/a。Node 值逐字对应 .nvmrc 或 package.json 的 engines.node；lockfile 填文件名；容器填 Dockerfile FROM 的镜像令牌。

<!-- buildbeat-stack-baseline:v1
nodeConstraint=<.nvmrc / engines.node 的精确值；多值重复本行；无则 n/a>
lockfileKind=<lockfile 文件名；多类重复本行；无则 n/a>
dockerFromImage=<Dockerfile FROM 镜像；多值重复本行；无则 n/a>
-->

## Rules

- `STACK-MUST-001`: 声明状态与 package、lockfile、版本文件、容器和部署配置等可观测状态冲突时，只报告漂移，不自动改代码或本文件。
- `STACK-MUST-002`: 更换核心运行时、框架、数据库、包管理器或部署平台前，必须建立 ADR，并同步 `contracts/PROTOCOL.md` 中受影响的跨边界事实。
- `STACK-SHOULD-001`: 版本约束应尽量指向一个可重复核对的仓库事实，无法确认的内容保留为 Draft，不靠猜测补齐。

## 变更记录

确认后将头部 Status 改为 `Confirmed`；后续变化在 `pm/decisions.md` 留索引，满足 ADR 判据时同时新增 ADR。
