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

1. 你说要做什么，AI 先写一份 `work.md` 给你看：目标、范围、做到什么算完
2. 你点头，它在一个单独的副本里写代码、跑你项目自己的测试
3. 另一个只读的 AI 来审查；有问题就修，修完重新测、重新审
4. 做完了停下来，等你拍板

测试结果由 BuildBeat 自己去读，不靠 AI 汇报。中途断了，说一句「继续」就接着跑。

## 开始用

把下面这段复制给你的 AI 编程工具（Claude Code、Codex、Cursor 都行），它会自己装好、配好：

```
请帮我在这个项目里用上 BuildBeat（https://github.com/HaiYangBG1/BuildBeat）：

1. 检查本机有没有 Node 20 以上和 Git，缺了就告诉我怎么装。
2. 安装或升级 BuildBeat 运行时：
   npm view @haiyangbg/buildbeat@latest version
   npm install --global @haiyangbg/buildbeat@latest
   buildbeat --version
   如果本机已经装了 3.x，并且还有没跑完的工作，先用旧版跑完或取消，再升级。
3. 读一遍 npm 包里的 SKILL.md 和 docs/v2/guide/01-quickstart.md（在 $(npm root -g)/@haiyangbg/buildbeat/ 下），之后都按 SKILL.md 的方式干活。
4. 按快速开始把模板放进这个项目、补好 .gitignore。实现、审查、修复默认用本机已登录的 AI 命令行工具，拿不准就问我。
5. 弄好后用一两句话告诉我可以开始了。之后我只用平常的话跟你说要做什么，命令都由你来跑。
```

装好之后，就用平常的话跟它说，常见场景见下面「用起来是什么样」。

<details>
<summary>用 Claude Code？也可以装插件</summary>

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

</details>

想自己动手一步步装，见[快速开始](docs/v2/guide/01-quickstart.md)。

## 用起来是什么样

| 场景 | 你说 | AI |
|---|---|---|
| 第一次用 | （复制上面那段） | 装好运行时、放好模板，告诉你可以开始了 |
| 开始一项工作 | 给账本加个导出 CSV 的功能 | 写好 `work.md` 给你看：导出当前筛选的账目，带逗号的字段加引号，测试全过才算完 |
| | 行，开工 | 开工，做完或需要你的时候再叫你 |
| 换会话、换电脑、换人 | 到哪了？ | 「导出 CSV」做完了，等你拍板：第一轮审查发现带逗号没加引号，已修好重测，第二轮通过 |
| 拍板 | 批准，合并吧 | 合并 |
| | 再改改，空表也要能导出 | 接着修，重新测、重新审，过了再叫你 |
| 自己动手改了 | 按钮文案我改了，已经提交 | 把你的改动重新测、重新审，过了再叫你 |
| 卡住了 | | 停下来告诉你：本地数据库没启动，这不是代码问题，没去改代码 |
| | 开好了，继续 | 接着跑 |
| 好几个仓库 | 所有仓库到哪了？ | 一次列出全部待办 |

它会停下来找你的情况只有这几种：做完了等你拍板、预算用完、审查一直不收敛、环境出了问题。

<details>
<summary>「到哪了？」时 AI 背后看到的输出</summary>

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

- `delivery/` 进 Git：换会话、换软件、换电脑、换人，拉下代码就能接着干
- `.buildbeat/runtime/`、`.buildbeat/worktrees/` 只在本机：正在跑的那一轮不跟着 Git 走，要在原来那台机器上跑完或停掉
- 没装 BuildBeat 的人和 AI 也能读这些文件、起草 `work.md`

## 能力边界

- **AI 只能动它该动的**：实现和修复只能改 run 配置里允许的目录，审查是只读的；日志里的密钥按配置的规则打码。
- **它不替你做决定**：合并、推送、部署、发布都要你自己授权去做。你批准的就是你看过的那一版，之后代码再变，就得重新批准。上线之后，AI 会跑一遍项目自己的检查并记下来，检查通过这项工作才算结束。
- **它不管的事**：不做多人账号、角色/权限管理，不采集或上传项目使用数据，没有遥测采集。用哪个模型、怎么登录，由你配置的 AI 工具决定。

参与贡献看[贡献指南](CONTRIBUTING.md)，代码以 [MIT 许可证](LICENSE)开源。

> **名字的由来**：每一步是一个音符，Agent 按节拍把它们演奏出来；演奏过的乐谱——上下文、决定和结论——留在 Git 里，随时翻阅。
