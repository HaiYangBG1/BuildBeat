# Phase 2-B WP2.7 write-pilot preflight — 2026-08-25

> 后续状态：用户已点名真实目录，并在后续独立授权下完成本地写入、Git/Hook 与 evidence commits；最终实测结果见 [`PHASE2-PILOT-2026-08-25.md`](PHASE2-PILOT-2026-08-25.md)。本文件保留写前候选排除与授权合同，不回写成事后记录。
>
> 品牌迁移边界：本预检和后续 WP2.7 试点发生在 BuildBeat 改名之前，只证明 legacy Solobaton namespace 的行为。它们不替代 `BUILDBEAT.md` / `.buildbeat` / `buildbeat` canonical 路径的新试点。

## 目的与权限边界

本预检只为 WP2.7 的三条真实写路径选择合法目标。它运行工作区源码候选的 `doctor --json` 与 `adopt --dry-run --json`，并读取目标根 Git 的 HEAD 与可见变更数量；没有运行 `init/adopt --yes`、手动拷贝、Git 初始化、Hook 安装、commit、push、发布或部署。

`dry-run` 的结构化结果均为 `writesPerformed=false`。命令前后再次读取的 HEAD 和可见变更数量一致；这证明本次只读命令没有产生 Git 可见变化，不代表目标原有内容、测试、部署或生产状态已验收。

## 已检查的相邻候选

| 候选 | 只读事实 | WP2.7 结论 |
|---|---|---|
| `../pilot-app` | 根 Git 干净，HEAD `8c7d3f322fb0`；doctor 判为 partial default layout、无 version marker/manifest；adopt 发现 9 个目标碰撞并返回 `ready=false` | 不能作为当前 Wave 1 adopt 写试点。须另立人工接管/所有权对账工作包，不能让 CLI 猜已有文件归属 |
| `../试点工作区` | 根 Git 有 15 个可见变更，HEAD `8e1b32db4885`；doctor 判为已安装 legacy v1.14、manifest 缺失；adopt 发现 9 个目标碰撞，并同时返回 already-installed、dirty、collision blockers | 不能作为 Wave 1 adopt 目标；它属于未来 legacy migration/upgrade 路径。当前脏工作区也不满足任何写前条件 |

未读取或记录两仓的变更文件名、源码内容、配置值、凭据、远端状态或生产事实。上表是 2026-08-25 的点时只读结果，执行前必须重新预检。

## 仍需点名并授权的三个目标

WP2.7 不能用一次性 `mktemp` 回归冒充真实试点。开始写入前，用户须明确给出三个绝对路径，并逐项授权允许的副作用：

1. **CLI init 新项目**：一个不存在或空目录；授权创建骨架、按 Skill 渲染项目事实、按需初始化 Git/安装 Hook，以及是否允许创建本地证据 commit。
2. **CLI adopt 存量项目**：一个根 Git 干净、未安装/未部分安装 Solobaton、planned path 零碰撞的长期项目；先以新的 `adopt --dry-run --json` 证明 `ready=true`，再单独批准 apply。
3. **Skill-only 项目**：一个不存在、空或明确允许写入的目标；授权手动等价 Bootstrap、可选 Git/Hook 和本地证据 commit。该路径不得生成 CLI manifest。

默认不授权 push、merge、tag、GitHub Release、npm publish、部署、生产访问或常态流量。任何目标在执行前变脏、出现碰撞、符号链接边界或已有安装迹象，试点立即 fail-closed 并回到重新选址，不使用 `--force` 或手工覆盖绕过。

## 验收合同

每个获批目标都保存写前/写后 Git 可见状态摘要，记录实际命令和 exit code，并分别证明：

- CLI `init/adopt` 先 dry-run，再经同一确认包执行；写入结果与 manifest schema 2 对齐；
- Skill 完成所有项目语义渲染，`pendingPlaceholders` 清零或对不可适用项给出合法项目事实；
- optional standards/ADR 仍由项目选择，缺失合法，不能为了“全绿”批量生成；
- `doctor` 无 error；`bus-check --strict` 的 conflict/error 为零，warning/unverified 保持诚实；
- Skill-only 目标无 `.solobaton/manifest.json`；CLI 目标 manifest 最后写入；
- 原项目内容、既有 Hook 链和 `.gitignore` 所有权没有被未授权覆盖；
- 证据只支持各目标的本地试点结论，不外推为 npm 发布、远端基线、线上部署或生产健康。
