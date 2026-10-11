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

BuildBeat 面向人和 AI 会话，解决用 AI 写代码时最常卡住的三件事：

- **会话一换，上下文就没了**，又得从头交代一遍；
- **AI 说「做完了、测过了」**，你没法判断是不是真的；
- **改过好几轮**，你不确定自己批准的是哪一版。

它把工作说明、决定和每轮结论写进项目文件与 Git；实现、验证、审查、修复在会话之外自动推进，中断了能接着跑；最后候选带着证据停下，等你拍板。

## 一眼看懂

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light.png" width="100%" alt="交付循环：work.md 之后依次是实现、验证、审查，审查有问题就修复、重验、再审，最后停下等你拍板；work.md、决定、审查问题和每轮运行的终态记录留在 Git 里">
</picture>

一项工作对应一份 `work.md`。你接受之后，`buildbeat run` 在隔离的工作树里推进：实现 → 跑项目自己的验证命令 → 独立只读审查，有问题就修复、重验、再审。只在真正需要人的时候停下：合并拍板、环境故障、预算到顶、审查不收敛。

## 怎么做到的

### 换会话不用重新交代

要做什么、做到哪一步、拍过什么板，都写在项目的 `delivery/work/` 里，跟着 Git 走。新会话、别的 AI 工具或者同事接手，读这份记录就能接着干。跑到一半断了，再执行一次 `buildbeat run` 就从断点继续。手上有好几个仓库，`buildbeat status --repo . --all-repos` 一次看完所有待办。

### 测试结果是跑出来的，不是 AI 说的

验证就是跑你项目自己的测试命令，结果由 BuildBeat 自己去读，不听 AI 的总结。审查交给另一个只读的会话，它改不了代码。缺工具、服务连不上、审查没交报告，这类问题会直接停下来告诉你，不会被当成代码 bug 去乱改。

### 批的哪一版，合的就是哪一版

批准时要带上候选的提交号，审完之后代码又变过，之前的批准就不算数。合并前发现小问题，可以自己改完交回去（`run --adopt`），也可以一句话让它再修一轮（`decide --action fix`）。合并、推送、发布始终由你来做。

## 五分钟开始

需要 Node ≥ 20、Git，以及一个已登录的 AI 命令行工具。实现、审查、修复各由谁来做，在 run 配置里指定：Codex、Claude Code 或任意脚本都行。

**1. 安装运行时**

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

**2. 跟会话说（推荐）**：在 Claude Code 里装上插件，插件里的 Skill（[SKILL.md](SKILL.md)）会教会话怎么用运行时。

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

之后用平常的话推进：「准备这项功能」→ 会话写好 `work.md`；「接受，开工」→ 开始跑；「到哪了、需要我决定什么」→ 列出候选、证据和待决定事项。更多说法见[怎么和会话说话](docs/v2/guide/00-how-to-talk.md)。

**3. 或者直接用命令行**：按[快速开始](docs/v2/guide/01-quickstart.md)放好模板、写好 `work.md` 和 run 配置，然后：

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat check --config delivery/work/WORK-X/run-config.yaml
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

从 3.x 升级：先用原来的 3.x 运行时完成或取消进行中的 Run，见[迁移说明](docs/MIGRATION.md)。

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

- `delivery/work/<ID>/` **随 Git 走**：work.md、run 配置、决定、审查问题、每轮终态记录（结果、成本、证据摘要与引用）
- `.buildbeat/runtime/` **只在本机**：运行台账、日志、截图等原始证据
- `.buildbeat/worktrees/` **只在本机**：候选所在的隔离工作树

换会话前补齐未落盘事实；Git clone 不迁移活动进程和现场。没装运行时的人和工具也能读状态、写工作说明。

[跨会话接续](docs/v2/guide/11-session-handoff.md) · [中断恢复](docs/v2/guide/10-recovery.md) · [没有运行时也能参与](docs/v2/guide/12-without-runtime.md)

## 能力边界

BuildBeat 不提供多人账号、角色/权限系统，不采集或上传项目使用数据，没有遥测采集。模型和鉴权由配置的 AI 工具提供。合并、推送、部署、发布分别由获授权的外部操作完成；上线后可用 `buildbeat release` 记录项目自己的回读，回读通过才关窗。生产巡检和任意工作流/规则语言不在产品范围内。

[能力矩阵](docs/CAPABILITY-MATRIX.md) · [安全边界](docs/v2/guide/09-security-boundaries.md) · [迁移说明](docs/MIGRATION.md)

## 继续阅读

| 想做什么 | 看哪里 |
|---|---|
| 第一次接入一个项目 | [快速开始](docs/v2/guide/01-quickstart.md) |
| 平时怎么和会话说 | [怎么和会话说话](docs/v2/guide/00-how-to-talk.md) |
| 理解固定流程和 run 配置 | [流程与配置](docs/v2/guide/02-workflow-guide.md) |
| 批准、拒绝、证据 | [决定与证据](docs/v2/guide/07-approval-guide.md) |
| 换会话、换人接手 | [跨会话接续](docs/v2/guide/11-session-handoff.md) |
| 参与贡献 | [贡献指南](CONTRIBUTING.md) · [MIT 许可证](LICENSE) |

> **名字的由来**：每一步是一个音符，Agent 按节拍把它们演奏出来；演奏过的乐谱——上下文、决定和结论——留在 Git 里，随时翻阅。
