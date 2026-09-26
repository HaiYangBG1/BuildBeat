# Phase 2-B WP2.7 real-directory write pilot — 2026-08-25

> 历史证据：本报告记录的是 BuildBeat 改名之前的 legacy Solobaton namespace 试点。路径、hash、提交和当时的门禁计数保持原样，不回写成新品牌证据；`BUILDBEAT.md` / `.buildbeat` / `buildbeat` canonical 路径仍需新的真实目录回归。

## 结论

WP2.7 的三条真实目录写路径已完成**本地写入、Skill 语义渲染、Git/Hook 与本地 evidence commit 验收**：CLI `init`、CLI `adopt` 和 Skill-only Bootstrap 都按各自边界落盘；两个零写入分支仍为空；Tide 的 83 个既有文件与原 `.gitignore` 可还原内容逐字节未变；三个实际骨架的项目级占位符均清零，验证套件和离线 `bus-check --strict` 均 exit 0。

用户随后明确授权三个 apply 目标初始化根 Git、安装 pre-commit Hook，并分别创建仅本地 evidence commit。三个目标现均位于 `main`、各有 2 个提交、工作区干净、无 remote，Hook 与各自仓内规范脚本逐字节一致；`doctor` 均返回 `ok=true`，Skill-only 只保留预期的 `manifest.missing` warning。授权前 `doctor` 曾诚实返回 `git.not_initialized`，该阶段性结果没有被改写成已完成证据。没有执行 push、merge、tag、GitHub Release、npm publish、部署、生产访问或常态流量。

## 授权与目标

用户先明确点名以下本地目标并授权骨架写入与验收，随后又以“执行”明确授权三个 apply 目标的 Git 初始化、Hook 安装与仅本地 evidence commit；两次授权都不外推到 remote、push 或发布动作：

| 试点 | 目标 | 执行边界 |
|---|---|---|
| init 零写入 | `~/Downloads/solobaton测试/1` | 只运行 `init --dry-run --json` |
| init 人工拒绝 | `~/Downloads/solobaton测试/2` | 交互确认回答 `n` |
| init 真写 | `~/Downloads/solobaton测试/3` | `init --yes --json` + Skill 语义渲染 |
| adopt 真写 | `~/Downloads/tide_副本` | `adopt --yes --json` + 保护式语义渲染 |
| Skill-only | `~/Downloads/solobaton-skill测试` | 手动拷贝必需模板、排除 optional 前缀并语义渲染 |

三个 apply 目标写前均无根 Git；`1`、`2`、Skill-only 目标为空，Tide 是既有 Chrome 扩展。CLI 写路径均先跑 dry-run；Tide 写前计划为 compact layout、零目标碰撞、零 blocker、`ready=true`。Git 授权只覆盖目录 `3`、Tide 与 Skill-only；目录 `1`、`2` 继续保持零条目。

## 分路径证据

### 1. init 三分支

| 分支 | 结果 | 写后证据 |
|---|---|---|
| dry-run | exit 0，`writesPerformed=false` | 目录 `1` 仍为 0 条目 |
| 人工拒绝 | exit 0，明确返回 `Cancelled. No files changed.` | 目录 `2` 仍为 0 条目 |
| `--yes` apply | exit 0，default layout，manifest schema 2 最后写入 | 目录 `3` 有 19 个非本地验证标记文件；无 standards/ADR，项目占位符清零 |

目录 `3` 的 Gate2/Gate4 只在“本地协议试点无 UI、无部署”这一已限定范围内记为 `n/a | 理由:`；Git 闭环后 Gate1/Gate3 已分别以决策记录和 baseline commit 通过，工作包状态更新为完成。

### 2. Tide protect-and-adopt

Tide 采用 compact layout，协调脚本写入 `pm/scripts/`。既有根源码、`js/**`、构建目录 `tide/**`、`tide.zip`、依赖目录和项目数据均未作为语义渲染写入目标；没有运行可能重写构建产物的 build 命令。

写前/写后以同一算法扫描所有非 symlink 普通文件，排除 `node_modules`、新增 Solobaton 路径和 `.gitignore`：

| 保护项 | 写前 | 写后 | 结论 |
|---|---|---|---|
| 既有文件数 | 83 | 83 | 一致 |
| 聚合 SHA-256 | `5aef3e87290068388e8b8f218daa1d4abaed3e2d9d7251a8c37b6defb8b0cb18` | 同左 | 逐字节保护闭合 |
| 原 `.gitignore` 字节 | 173 | managed fragment 前缀还原为 173 | 一致 |
| 原 `.gitignore` SHA-256 | `31bd73f175152a312f56c77a0d9bcd61b597a9a4ac07c75a3d747f32aa19e91c` | 同左 | 原所有权未覆盖 |
| managed marker | 无 | begin/end 各 1 | 没有重复追加 |

静态项目事实显示 Tide 是 Manifest V3 Chrome 扩展，存在 action、content scripts 与 background service worker；但写前 CLI 报告 `hasUi=false`。根因是探测器只认 `index.html` 或常见前端依赖。源码候选已增加浏览器扩展 manifest 信号，新增回归后 CLI 测试 `34/34`；对同一 Tide 目录重跑只读检测得到 `hasUi=true`。因此 Tide 的 Gate2 继续 pending，不能因旧探测结果跳过真机/UI 走查。

### 3. Skill-only Bootstrap

Skill-only 目标有 18 个非本地验证标记文件；`gitignore.template` 已渲染为 `.gitignore`，没有 `.solobaton/manifest.json`、`standards/` 或 `pm/adr/`。这证明手动入口能形成可运行骨架，但不具备 CLI manifest ownership 与未来机械 upgrade 保证；`doctor` 的 `manifest.missing` 是预期能力边界，不应被消音或伪装成受管安装。

## 验证矩阵

| 检查 | init 真写 | Tide adopt | Skill-only |
|---|---|---|---|
| 项目级占位符 | 清零 | 清零 | 清零 |
| optional standards / ADR | 均缺失，合法 | 均缺失，合法 | 均缺失，合法 |
| `verify-status --run` | exit 0，协调脚本语法 | exit 0，package/manifest JSON 解析 | exit 0，协调脚本语法 |
| 离线 `bus-check --strict` | exit 0 | exit 0 | exit 0 |
| doctor 安装识别 | installed/default，manifest valid | installed/compact，manifest valid | installed/default，manifest missing |
| doctor 最终结果 | `ok=true`，0 error / 0 warning | `ok=true`，0 error / 0 warning | `ok=true`，0 error；预期 warning: `manifest.missing` |
| 根 Git / Hook / commit | `main` / 匹配规范脚本 / 2 个 | 同左 | 同左 |
| 最终工作区 / remote | clean / 无 | clean / 无 | clean / 无 |

本地提交证据如下。工作包/看板中的 Gate3 使用 baseline commit，避免提交自引用；evidence HEAD 则包含最终 NOW、看板、协议与决策记录。

| 目标 | baseline commit | evidence HEAD |
|---|---|---|
| init 真写 | `ab3b75b541a710ad2784964001f193a56d5ff90e` | `eb27a88663701ea03de776e32b6a23c2d1e3ac28` |
| Tide adopt | `bb3c681b4deb1123d6e6901b845dc58f2dbdd73b` | `5b6aa726a1722226f9651a14bf0fb8fa36a5f9f6` |
| Skill-only | `fb656c1967d1105c9003c8ee3a4369a7c5623657` | `b63383db9e56f17495a8ccc8edcb81e7c9cf24f0` |

离线 strict 的 exit 0 仍包含 `sync.unverified`：远端 fetch 与 live-status 被显式跳过，生产 drift adapter 未配置。它只证明当前本地文件总线没有 conflict/error，不证明远端同步、线上版本、部署或生产健康。

`upgrade --dry-run --json` 仍返回 exit 2 / `command_not_available`；本试点没有机械升级证据，也没有试图用手工覆盖模拟 Wave 2。

## 上游候选门禁

真实试点反馈回灌后，Solobaton 工作区完整门禁通过：Node `39/39`、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、98 份 Markdown 检查、71 文件 `npm pack --dry-run`，以及 ShellCheck、Bash/Node 语法、actionlint、`git diff --check`。这些结果验证当前未提交源码候选，不是 commit、tag、Release、npm registry 或生产证据。

## 剩余发布边界

WP2.7 的真实目录 Git/Hook/hash 证据闸已经完成。剩余事项属于**上游源码候选与发布序列**：当前 Solobaton 源仓差异仍未提交；任何 source commit、tag、GitHub Release、npm publish，以及首屏 `@latest init` 激活都需要独立授权和相应 registry 回读，不能由本地试点完成状态自动推出。
