<p align="center">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/hero.jpg" width="100%" alt="五线谱上依次排着实现、验证、审查、修复、拍板五个音符，一条脉搏线把它们连起来，末端收进一叠写满音符的乐谱">
</p>

<h1 align="center">BuildBeat</h1>

<h3 align="center">基于 Git 的项目上下文管理</h3>
<p align="center">每项需求为什么做、定了什么、做到哪，都跟代码一起存在 Git 里，<br>换会话、换工具、换人都能接着干。</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@haiyangbg/buildbeat"><img alt="npm 版本" src="https://img.shields.io/npm/v/@haiyangbg/buildbeat?color=d97706&amp;label=npm"></a>
  <a href="https://github.com/HaiYangBG1/BuildBeat/actions/workflows/ci.yml"><img alt="CI 状态" src="https://github.com/HaiYangBG1/BuildBeat/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@haiyangbg/buildbeat"><img alt="Node 版本要求" src="https://img.shields.io/node/v/@haiyangbg/buildbeat?color=59636e"></a>
  <a href="LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-e5534b"></a>
</p>

<p align="center">中文 · <a href="README.en.md">English</a></p>

用 AI 写代码，换个会话、换个软件、换台电脑、换个人，事情都得从头讲一遍。

BuildBeat 面向人和 AI 会话，把每项需求的来龙去脉记在项目和 Git 里，谁接手都能接着干。

## 一眼看懂

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/context-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/context-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/context-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/context-zh-light.png" width="100%" alt="一个 Git 仓库里放着两样东西：代码 src/export.js 和工作记录 delivery/work/WORK-CSV-EXPORT/（work.md、decisions.jsonl、review-findings.jsonl、result.md）；提交带 Work: WORK-CSV-EXPORT 标记，两头可以互查；两样都在同一段 Git 历史里">
</picture>

代码记录改了什么，工作记录写着为什么改、定了什么、做到哪。两样放在同一个仓库、同一段 Git 历史里，提交上带着工作编号，从哪头都能查到另一头。

## 解决什么问题

<table>
<tr>
<td>

### ① 换会话、换工具，接着干

会话越聊越长，AI 开始忘事；开个新会话、换个工具，又得从头讲一遍。BuildBeat 把每项需求的进度和决定写进项目文件，新会话读一遍，就从上次停下的地方接着干。一项工作放了几周再捡起来，如果里面提到的代码已经变了，也会提醒你。

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/handoff-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/handoff-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/handoff-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/handoff-zh-light.png" width="100%" alt="会话 A（Claude Code）做到一半，把断点写进项目文件（work.md、决定、每轮记录）；会话 B（Codex）读到这些文件，从断点接着干；几周后再捡起来时，如果 work.md 提到的 src/export.js:5-8 改过了，会先提醒">
</picture>

</td>
</tr>
</table>

<table>
<tr>
<td>

### ② 上下文归项目，不归某个人

AI 工具自带的记忆，是围着人设计的：记在某个人的账号里、某台电脑上。同事接手你的模块时看不到这些，你离开项目，来龙去脉也跟着没了。BuildBeat 是围着项目重新设计的：上下文是项目的一部分，跟代码放在同一个 Git 仓库里，拉下代码就有；它跟代码一起进 PR 审查、一起留版本历史，用什么 AI 工具都能读。

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/owner-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/owner-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/owner-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/owner-zh-light.png" width="100%" alt="左边围着人：工具自带的记忆记在你的账号、你的电脑、你的会话里，同事看不到，你离开项目来龙去脉也跟着没了；右边围着项目：项目仓库里有代码和 delivery/，你、同事、新会话、另一个 AI 工具都连到它，拉下代码就有、跟代码一起进 PR、有版本历史">
</picture>

</td>
</tr>
</table>

<table>
<tr>
<td>

### ③ 记录是干活时顺手留下的

需求文档和决定记录，大家都知道该写，但没人有空写，写了也很快过时。在 BuildBeat 里，这些是干活时顺手留下的：AI 先写一份 work.md 给你看，你点头后，决定、测试结果和审查意见都会记下来，做完再留一份结论。

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/loop-zh-light.png" width="100%" alt="交付循环：work.md 之后依次是实现、验证、审查，审查有问题就修复、重验、再审，最后停下等你拍板；work.md、决定、审查问题和每轮运行的终态记录留在 Git 里">
</picture>

</td>
</tr>
</table>

<table>
<tr>
<td>

### ④ 从一行代码查回需求

三个月后看到一段代码，没人记得当时为什么这么写，问 AI 它也只能猜。用 BuildBeat，指着这行代码就能查出它是为哪项需求写的、当时定了什么；也能按工单号查。

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/trace-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/trace-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/trace-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/trace-zh-light.png" width="100%" alt="问 src/export.js 第 7 行为什么这么写：buildbeat history --repo . --path src/export.js:7 找到 WORK-CSV-EXPORT，记录里写着目标是导出当前筛选的账目、定了带逗号的字段加引号、第 1 轮审查发现没加引号已修、由你在 10-25 14:02 批准">
</picture>

</td>
</tr>
</table>

<table>
<tr>
<td>

### ⑤ 做没做完，看证据

AI 说「改好了，测试都过了」，你不敢全信，只能自己再跑一遍、再看一遍。BuildBeat 自己去读测试结果，再让另一个只读的 AI 审查，有问题就修，修完重新测、重新审，最后停下来等你拍板，什么时候、谁同意的都有记录。

<picture>
  <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/evidence-zh-dark-narrow.png">
  <source media="(max-width: 600px)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/evidence-zh-light-narrow.png">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/evidence-zh-dark.png">
  <img src="https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/docs/assets/readme/evidence-zh-light.png" width="100%" alt="AI 说“改好了，测试都过了”不算数；BuildBeat 去核对：测试结果由 BuildBeat 自己读，跑的是项目自己的测试命令；另一个只读的 AI 审查了 2 轮，1 个问题已修并重新测过；最后你拍板，批准人和时间记进 decisions.jsonl">
</picture>

</td>
</tr>
</table>

> 从代码查需求、自己读测试结果、代码变了的提醒，需要装运行时。不装运行时、只让 AI 工具读项目文件，其余部分照样能用，见[只用 Skill 和项目文件](docs/v2/guide/12-without-runtime.md)。

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

不想装 Node 或运行时？只用 Skill 和项目文件也行，见[只用 Skill 和项目文件](docs/v2/guide/12-without-runtime.md)。

## 用起来是什么样

| 场景 | 对话 |
| --- | --- |
| **第一次用** | **你**：（复制上面那段）<br>**AI**：装好了，可以开始了。 |
| **开始一项工作** | **你**：给账本加个导出 CSV 的功能。<br>**AI**：写好了 `work.md`：导出当前筛选的账目，带逗号的字段加引号，测试全过才算完。你看行吗？<br>**你**：行，开工。 |
| **换会话、换电脑、换人** | **你**：到哪了？<br>**AI**：「导出 CSV」做完了，等你拍板。第一轮审查发现带逗号没加引号，已经修好、重新测过，第二轮通过了。<br>**你**：批准，合并吧。 |
| **想再改改** | **你**：空表也要能导出。<br>**AI**：好，我接着改，重新测、重新审，过了再叫你。 |
| **你自己动手改了** | **你**：按钮文案我改了，已经提交。<br>**AI**：看到了，我把你的改动重新测一遍、审一遍。 |
| **卡住了** | **AI**：停下来了：本地数据库没启动。这不是代码问题，我没改代码。<br>**你**：开好了，继续。 |
| **好几个仓库** | **你**：所有仓库到哪了？<br>**AI**：两个仓库一共三项工作：一项等你拍板，两项还在跑。 |

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

## 什么是一项工作

**是什么**：BuildBeat 记东西的最小单位。一个你能看到的结果，比如「导出 CSV」，就是一项工作，对应一个文件夹。

**为什么要有它**：AI 记不住事，会话也随时会换。把这件事要做什么、做到哪、审出过什么问题、你拍过什么板，都收进这个文件夹，谁接手都从这里接着干，回头也能翻出来看它是怎么做成的。

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
│           ├── result.md           关窗时写：做成了什么、剩下什么、写进了哪些项目文档
│           └── runs/RUN-X-01/
│               └── run-record.json 这一轮的结果、证据和成本
└── .buildbeat/
    ├── notify.yaml                 可选：等你拍板时发 webhook 或钉钉通知
    ├── runtime/                    只在本机：正在跑的台账、日志、截图
    └── worktrees/                  只在本机：AI 干活用的隔离副本
```

- `delivery/` 进 Git：换会话、换软件、换电脑、换人，拉下代码就能接着干；不要在 `.gitignore` 或 `.git/info/exclude` 里排除它。里面的截图、压缩包和日志只留本机，不进 Git
- `.buildbeat/runtime/`、`.buildbeat/worktrees/` 只在本机：正在跑的那一轮不跟着 Git 走，要在原来那台机器上跑完或停掉
- 没装 BuildBeat 的人和 AI 也能读这些文件、起草 `work.md`

参与贡献看[贡献指南](CONTRIBUTING.md)，代码以 [MIT 许可证](LICENSE)开源。

> **名字的由来**：每一步是一个音符，Agent 按节拍把它们演奏出来；演奏过的乐谱——上下文、决定和结论——留在 Git 里，随时翻阅。
