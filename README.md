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

一项工作对应一份 `work.md`。你点头之后，`buildbeat run` 在一个单独的工作树里开工：先实现，再跑你项目自己的测试，然后交给另一个只读的会话审查；审出问题就修，修完重新测、重新审。测试结果由 BuildBeat 自己去读，不靠 AI 汇报。中途断了，再执行一次 `buildbeat run` 就接着跑。

它只在需要人的时候停下：等你决定合不合、预算用完、审查一直不收敛，或者环境出了问题（缺工具、服务连不上这类，不会被当成代码 bug 去改）。

## 五分钟开始

需要 Node ≥ 20、Git，以及一个已登录的 AI 命令行工具。实现、审查、修复各由谁来做，在 run 配置里指定：Codex、Claude Code 或任意脚本都行。

**1. 安装运行时**

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

**2. 跟会话说（推荐）**：在 Claude Code 里装上插件，会话就知道怎么用 BuildBeat。

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

之后用平常的话推进：

| 你说 | 会话做什么 |
|---|---|
| 准备这项功能 | 写好 `work.md`：目标、范围、做到什么算完 |
| 接受，开工 | 记下你的同意，开始跑 |
| 到哪了、需要我决定什么 | 列出当前结果、测试和审查的证据、等你拍板的事 |
| 我已经修好了 | 核对你的提交，接着重新测、重新审 |
| 换会话 | 把还没记下的事写进项目，新会话从记录接着干 |

**3. 或者直接用命令行**：把模板放进项目（见下面「项目里的文件」），写好 `work.md` 和 run 配置，然后：

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat check --config delivery/work/WORK-X/run-config.yaml
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

`check` 先检查配置和环境有没有问题；`run` 开跑，中途断了再执行一次就接着来。每一步的细节见[快速开始](docs/v2/guide/01-quickstart.md)。

从 3.x 升级：先用原来的 3.x 运行时把进行中的 Run 跑完或取消，再换新版本。

## 跑起来是什么样

一项工作在第 1 轮审查里被挑出一个问题，修好、重测，第 2 轮审查通过，然后停下来等你拍板。下面是真实输出的节选（`…` 处有省略）：

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


`cost` 那行写着审了几轮、发现几个问题、人等了多久。下面四个 `next` 是你能做的选择：批准这一版、拒绝、自己改好交回、让它再修一轮。批准会绑定这一版的提交号，审完之后代码要是又变了，原来的批准就不作数。

## 项目里的文件

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

模板随 npm 包一起装好，在 `$(npm root -g)/@haiyangbg/buildbeat/templates/`。没装 BuildBeat 的人和 AI 也能读这些文件、起草 `work.md`。手上有好几个仓库，`buildbeat status --repo . --all-repos` 一次看完所有待办。

## 能力边界

- **AI 只能动它该动的**：实现和修复只能改 run 配置里允许的目录，审查是只读的；日志里的密钥按配置的规则打码。
- **它不替你做决定**：合并、推送、部署、发布都要你自己授权去做。上线之后可以用 `buildbeat release` 跑一遍项目自己的检查并记下来，检查通过这项工作才算结束。
- **它不管的事**：不做多人账号、角色/权限管理，不采集或上传项目使用数据，没有遥测采集。用哪个模型、怎么登录，由你配置的 AI 工具决定。

参与贡献看[贡献指南](CONTRIBUTING.md)，代码以 [MIT 许可证](LICENSE)开源。

> **名字的由来**：每一步是一个音符，Agent 按节拍把它们演奏出来；演奏过的乐谱——上下文、决定和结论——留在 Git 里，随时翻阅。
