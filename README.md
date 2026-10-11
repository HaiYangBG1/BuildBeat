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

用 AI 写代码，换个会话、换个软件、换台电脑、换个人，事情都得从头讲一遍。

BuildBeat 面向人和 AI 会话，把要做的事、做到哪、定过什么都记在项目和 Git 里，谁接手都能接着干。AI 写完代码，它会接着跑测试、做审查、修问题，最后停下来等你拍板。

## 一眼看懂

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light.png" width="100%" alt="交付循环：work.md 之后依次是实现、验证、审查，审查有问题就修复、重验、再审，最后停下等你拍板；work.md、决定、审查问题和每轮运行的终态记录留在 Git 里">
</picture>

你告诉 AI 要做什么，它先写一份 `work.md` 给你看：目标、范围、做到什么算完。你点头之后，它在一个单独的副本里开工：先写代码，再跑你项目自己的测试，然后交给另一个只读的 AI 审查；审出问题就修，修完重新测、重新审。测试结果由 BuildBeat 自己去读，不靠 AI 汇报。中途断了，换个会话说一句「继续」就接着跑。

它只在需要你的时候停下来问你：做完了等你拍板、预算用完、审查一直不收敛，或者环境出了问题（缺工具、服务连不上这类，不会被当成代码 bug 去改）。

## 开始用

需要 Node ≥ 20、Git，以及一个已登录的 AI 编程工具。实现、审查、修复各交给哪个 AI，在配置里写：Codex、Claude Code 或任意脚本都行。

**1. 装一次运行时**（也可以直接让 AI 帮你装）

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

**2. 在 Claude Code 里装插件**，AI 就知道怎么用 BuildBeat。用别的 AI 工具，就让它先读 npm 包里的 `SKILL.md`。

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

**3. 之后就跟 AI 说话**，命令都由它来跑：

| 你说 | AI 做什么 |
|---|---|
| 在这个项目里用 BuildBeat | 照模板放好文件、填好配置，先检查一遍能不能跑 |
| 准备这项功能 | 写好 `work.md` 给你看 |
| 接受，开工 | 记下你的同意，开始写代码、测试、审查、修复 |
| 到哪了、需要我决定什么 | 告诉你结果、测试和审查的证据、等你拍板的事 |
| 批准 / 再修一下 / 我自己改好了 | 记下你的决定；需要的话接着修、重新测、重新审 |
| 继续 | 新会话从项目里的记录接着干 |

想自己敲命令，见[快速开始](docs/v2/guide/01-quickstart.md)。从 3.x 升级：先让旧版把进行中的工作跑完或取消，再换新版本。

## 用起来是什么样

**开始一项工作**

> **你**：给账本加个导出 CSV 的功能。
>
> **AI**：写好了 `work.md`：导出当前筛选的账目，带逗号的字段要加引号，测试全过才算完。你看行吗？
>
> **你**：行，开工。
>
> **AI**：开工了。做完或者需要你的时候我再叫你。

**第二天换了个新会话**

> **你**：到哪了？
>
> **AI**：「导出 CSV」做完了，在等你拍板。第一轮审查挑出一个问题：带逗号的字段没加引号。已经修好、重新测过，第二轮审查通过了。你看是直接批准，还是让我再改改？
>
> **你**：批准，合并吧。
>
> **AI**：好，已经合并。

**跑到一半卡住了**

> **AI**：停下来了：测试要连本地数据库，但数据库没启动。这不是代码的问题，我没去改代码。你把数据库开起来，说一声我就接着跑。
>
> **你**：开好了，继续。

**你自己动手改了**

> **你**：按钮文案我自己改了一下，已经提交。
>
> **AI**：看到了。我把你的改动重新测一遍、审一遍，过了再叫你拍板。

<details>
<summary>换会话那个例子里，AI 背后看到的输出</summary>

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

</details>

## 项目里的文件

第一次接入时，AI 会照模板把这些文件放好：

```
你的项目/
├── AGENTS.md、CLAUDE.md            告诉 AI 工具：这个项目用 BuildBeat
├── .gitignore                      加上下面两行 .buildbeat/ 目录
├── delivery/                       跟着 Git 走
│   ├── envelope/
│   │   ├── worker.sh               把 AI 工具包成 BuildBeat 能调用的一步
│   │   └── prompts/                实现、审查、修复各自的提示词
│   └── work/
│       └── WORK-X/                 一项工作一个文件夹
│           ├── work.md             要做什么、做到什么算完
│           ├── run-config.yaml     用哪个 AI、跑什么测试、能改哪些目录
│           ├── decisions.jsonl     接受、批准、关闭这些决定
│           ├── review-findings.jsonl  审查挑出的问题和你的裁决
│           ├── releases.jsonl      上线后的检查记录（用到才有）
│           └── runs/RUN-X-01/
│               └── run-record.json 这一轮的结果、证据和成本
└── .buildbeat/
    ├── notify.yaml                 可选：等你拍板时发 webhook 或钉钉通知
    ├── runtime/                    只在本机：正在跑的台账、日志、截图
    └── worktrees/                  只在本机：AI 干活用的隔离副本
```

`delivery/` 里的东西都进 Git，换会话、换软件、换电脑、换人，拉下代码就能接着干。`.buildbeat/runtime/` 和 `.buildbeat/worktrees/` 只在本机，正在跑的那一轮不会跟着 Git 走，要在原来那台机器上跑完或停掉。

没装 BuildBeat 的人和 AI 也能读这些文件、起草 `work.md`。手上有好几个仓库，问一句「所有仓库到哪了」，AI 会一次列出全部待办。

## 能力边界

- **AI 只能动它该动的**：实现和修复只能改 run 配置里允许的目录，审查是只读的；日志里的密钥按配置的规则打码。
- **它不替你做决定**：合并、推送、部署、发布都要你自己授权去做。你批准的就是你看过的那一版，之后代码再变，就得重新批准。上线之后，AI 会跑一遍项目自己的检查并记下来，检查通过这项工作才算结束。
- **它不管的事**：不做多人账号、角色/权限管理，不采集或上传项目使用数据，没有遥测采集。用哪个模型、怎么登录，由你配置的 AI 工具决定。

参与贡献看[贡献指南](CONTRIBUTING.md)，代码以 [MIT 许可证](LICENSE)开源。

> **名字的由来**：每一步是一个音符，Agent 按节拍把它们演奏出来；演奏过的乐谱——上下文、决定和结论——留在 Git 里，随时翻阅。
