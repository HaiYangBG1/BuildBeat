<p align="center">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/hero.jpg" width="100%" alt="五线谱上依次排着实现、验证、审查、修复、拍板五个音符，一条脉搏线把它们连起来，末端收进一叠写满音符的乐谱">
</p>

<h1 align="center">BuildBeat</h1>

<p align="center"><strong>会话随时换，项目接着干。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@haiyangbg/buildbeat"><img alt="npm 版本" src="https://img.shields.io/npm/v/@haiyangbg/buildbeat?color=d97706&amp;label=npm"></a>
  <a href="https://github.com/HaiYangBG1/BuildBeat/actions/workflows/ci.yml"><img alt="CI 状态" src="https://github.com/HaiYangBG1/BuildBeat/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-e5534b"></a>
</p>

<p align="center">中文 · <a href="README.en.md">English</a></p>

> **名字的由来**：每一步是一个音符，Agent 按节拍把它们演奏出来；演奏过的乐谱——上下文、决定和结论——留在 Git 里，随时翻阅。

BuildBeat 面向人和 AI 会话：工作说明、决定和每轮结论留在项目文件与 Git 里，实现、验证、审查和修复在会话之外自动推进、随时可恢复，候选带着证据停在你的合并决定前。

## 一眼看懂

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light.png" width="100%" alt="交付循环：work.md 之后依次是实现、验证、审查，审查有问题就修复、重验、再审，最后停下等你拍板；work.md、决定、审查问题和每轮运行的终态记录留在 Git 里">
</picture>

一项工作写一份 `work.md`。你接受之后，`buildbeat run` 在隔离的工作树里按节拍推进：实现、跑项目自己的验证命令、独立只读审查，有问题就修复、重验、再审。真正需要人的时候它会停下：合并拍板、环境故障、预算到顶、审查不收敛。工作说明、决定、审查问题和每轮运行的终态记录都进 Git，换会话、换工具、换人都从同一份记录接着干；运行中的台账和原始日志留在本机（见下文「记录与接续」）。

## 三个承诺

### 走得开

**关掉会话、换 AI 工具、换人，工作照样接着干。** 工作说明和运行台账都在项目里，`buildbeat run` 从记录恢复；主仓带多个代码仓时，`buildbeat status --repo . --all-repos` 一条命令看全所有仓的待办。

### 回来能信

**回来看到的是事实，不是 AI 的自述。** 验证跑项目真实命令，结果由运行时从 Git 和台账回读；审查独立、只读；缺工具、后端不可用、审查没交报告都按环境故障停下，不会当成代码问题去修。

### 敢拍板

**你批准的就是你看过的那一版。** 合并批准绑定候选（`--candidate`）；合并决定点发现小问题，可以自己修好交回（`run --adopt`），或一句话退回给修复者（`decide --action fix`）；合并、推送、发布、部署始终由人决定。

## 五分钟开始

运行时需要 Node ≥ 20。从 3.x 升级前，先用原来的 3.x 运行时完成或取消仍在进行的 Run（见[迁移说明](docs/MIGRATION.md)）。先读 [SKILL.md](SKILL.md) 与[快速开始](docs/v2/guide/01-quickstart.md)：把模板放进项目，写一份 `work.md`，在 run 配置里填好真实的 AI 工具和验证命令。

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

## 跑起来是什么样

一项工作在第 1 轮审查里被挑出一个问题，修复者修好、重验，第 2 轮审查通过，然后停在你的合并决定前。下面是真实输出的节选（`…` 处有省略）：

```text
$ buildbeat status --repo . --work WORK-CSV-EXPORT
WORK-CSV-EXPORT  MERGE_DECISION
  [P1 0b5e258117cb5602] (accept) csv: quote fields that contain commas
  work.md ✓ · runs 1
  cost: review rounds 2 · findings 1 · human waits 1 (open 33s) · worker 2s
work WORK-CSV-EXPORT:
  RUN-CSV-EXPORT-01 [final-decision] enter-wait-merge — waiting 33s
    candidate: ede20b668cb04ae30cba1676b5e031930e711c8d
    next: buildbeat decide --action approve … --candidate ede20b6… --by <you>
    next: buildbeat decide --action reject … --reason <why> --by <you>
    next: buildbeat run … --adopt <sha> --by <you>   # commit a manual repair in the run worktree …
    next: buildbeat decide … --action fix --reason <what to repair> --by <you>
```

成本行告诉你审查了几轮、发现了几个问题、人等了多久，以及这些等待的去向。决定卡给出四种选择：批准（绑定这一版候选）、拒绝、自己修好交回、退回给修复者。

## 记录与接续

端到端工作包把一项工作的来龙去脉留在仓库里：

| 位置 | 内容 | 随 Git 走 |
|---|---|---|
| `delivery/work/<ID>/` | work.md、run 配置、决定、审查问题、每轮终态记录（结果、成本、证据摘要与引用） | 是 |
| `.buildbeat/runtime/` | 运行台账、日志、截图等原始证据 | 否，只在本机 |
| `.buildbeat/worktrees/` | 候选所在的隔离工作树 | 否，只在本机 |

换会话前补齐未落盘事实；Git clone 不迁移活动进程和现场。没装运行时的人和工具也能读状态、写工作说明。

[跨会话接续](docs/v2/guide/11-session-handoff.md) · [中断恢复](docs/v2/guide/10-recovery.md) · [没有运行时也能参与](docs/v2/guide/12-without-runtime.md)

## 能力边界

BuildBeat 不提供多人账号、角色/权限系统，不采集或上传项目使用数据，没有遥测采集。模型和鉴权由配置的 AI 工具提供。合并、推送、部署、发布分别由获授权的外部操作完成；上线后可用 `buildbeat release` 记录项目自己的回读，回读通过才关窗。生产巡检和任意工作流/规则语言不在产品范围内。

[能力矩阵](docs/CAPABILITY-MATRIX.md) · [安全边界](docs/v2/guide/09-security-boundaries.md) · [迁移说明](docs/MIGRATION.md)

## Claude Code 插件

插件提供 Skill、模板与文档，运行时单独安装。

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

## 继续阅读

| 想做什么 | 看哪里 |
|---|---|
| 第一次接入一个项目 | [快速开始](docs/v2/guide/01-quickstart.md) |
| 平时怎么和会话说 | [怎么和会话说话](docs/v2/guide/00-how-to-talk.md) |
| 理解固定流程和 run 配置 | [流程与配置](docs/v2/guide/02-workflow-guide.md) |
| 批准、拒绝、证据 | [决定与证据](docs/v2/guide/07-approval-guide.md) |
| 换会话、换人接手 | [跨会话接续](docs/v2/guide/11-session-handoff.md) |
| 参与贡献 | [贡献指南](CONTRIBUTING.md) · [MIT 许可证](LICENSE) |
