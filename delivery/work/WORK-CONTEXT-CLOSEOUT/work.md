# 工作说明按真实写法改，收口时写结果、把结论写进项目

## 目标

BuildBeat 管的是一项工作的上下文：为什么做、查实了什么、定了什么、做成了什么、还剩什么。现在这层只管到开工和合并：

- 随包的 `work.example.md` 只有目标、范围、验收、计划、停止五节。试点里真实写出来的工作说明，大约一半还有"不做""已核实的现状""开工前待拍板""所有者原话"这些节，模板里一节都没有。
- 合并之后没有收口。没设上线回读的工作，运行时关不了窗，status 只说"没有剩下的事"。做成了什么、剩下什么、学到了什么，要么塞进一行关窗结论，要么散在各自起名的文件里，要么没写。
- 一项工作学到的、以后还用得上的结论，没有固定去处，下一项工作重新踩一遍。

本 Work 做三件事：模板照试点里长出来的写法改；每项工作关窗时写一页 `result.md`，没设上线回读的工作也能关；关窗前把要长期有效的结论写进项目自己的文档，`result.md` 记下写进了哪个文件、哪个提交，由运行时核对属实。

## 起因

所有者 2026-10-24 定调：BuildBeat 的核心是「基于 git 的需求级的上下文管理」，因为「不管 skill 怎么发展，模型怎么发展，上下文的重要性是不变的」；项目以自用为主，也会推荐给团队。2026-10-25：「先展开第 1 件：把我自己长出来的 work.md 写法收进产品，加上关窗收口和知识提升」。

## 已核实的现状（2026-10-25，`main` `4a25344`）

**代码已确认**

- `decide --work <ID> --action close` 必须带 `--result <text>`，并要求本工作 `releases.jsonl` 最近一次回读通过，没有回读记录就拒绝（`src/v2/runtime/release.js` 的 `closeWork`）。关窗行只记 `subject.result`、回读摘要、提交和候选。
- 合并后所有 run-config 都没有 `release:` 的工作，status 提示 `merged; no release readback configured, nothing left to do`，跨仓总览计入已了结（`merged, no release step`）。只写文档、没有 run-config 的工作，提示手写一行 `close-work` 进 `decisions.jsonl`（`src/v2/runtime/overview.js`）。
- 运行时不解析 `work.md` 的章节，接受时只绑定整个文件的 SHA-256。模板 `templates/v2/work.example.md` 五节：Goal / Scope / Acceptance / Implementation plan / Stop conditions，快速开始让人照这五节写。
- `--note` 只在问题裁决（`decide --action accept|dismiss`）和 `release` 上有。接受 `work.md`、关窗都没有地方记人的原话。
- status 判断"已合并"用的是主检出当前所在分支（`overview.js` 的 `headRef`）。

**试点工作区和本仓（只读统计，2026-10-24～25）**

- 41 份 `work.md` 里：写了"不做"的 20 份，"已核实的现状"（带日期或钉在某个提交上）21 份，"开工前待拍板"（推荐加另一种做法）19 份，用所有者原话记下的"已定"22 份，"停止条件"31 份，要确认的对外名字 3 份。
- 115 项工作里 82 项关了窗，只有 26 项的关窗绑定了上线回读。关窗结论都是一行字，中位 138 字、最长 461 字，里面塞着交付内容、合并方式、审查轮数和遗留。另有 16 项手写了 `result.md`、11 项手写了运行记录、3 项写了遗留清单，名字和格式各不相同。
- 21 个上线回读脚本里，15 个只查 Git（提交在不在主干、测试还在不在），不探测任何线上服务。其中一个只改测试的工作，脚本自己写明"只改测试，没有发布"，它存在只是为了能关窗。
- 26 项工作各写了一份环境事实，同类事实反复出现：系统钥匙串 12 项、同一个包管理器 9 项、端口 8 项、容器工具 5 项。
- 试点的项目入口文档仍写运行时 4.0.0（本机装的是 4.2.3），仍写"合并决定点不能 `--adopt`"（4.2.0 起已支持）。学到的东西没有写回，写回过的也没跟着更新。

**运行时待核**

- 文档改动经合并请求进主干时，"提交在主干上、改了这个文件"的核对是否成立：用 merge commit 和 squash 两种合并方式的夹具验证。
- `status --work` 现场核对写回行增加的耗时：在试点里挑一项工作实测。

## 范围

包含：

- **模板**：`work.example.md` 改成八节（标题原文见"对外名字"），每节一两句写法说明。"已核实的现状"分已确认和待核两类：已确认的每条带出处（文件、提交、命令输出），待核的写明由谁、什么时候确认。"开工前待拍板"每项给推荐和另一种做法的后果，对外名字写原文。"验收"把机器能查的和只有人或线上能确认的分开。"停止条件"写什么情况必须停下问人，不只写预算。新增 `result.example.md`。模板用英文，Skill 说明照项目的语言写，标题可以翻译。
- **运行时**：关窗按第 1 项改：读 `result.md`、绑定摘要、取摘要行；按第 2 项解析和核对写回行；按第 4 项加 `--note`。旧的关窗行照常读，不补算，不改写。
- **status**：按第 3 项改提示和计数。已关的工作显示摘要和写回条数。`status --work` 列出每条写回行和现场核对结果（✓/✗）、决定附带的原话、关窗后 `result.md` 有没有改过。只写文档的工作，提示改为写好 `result.md` 再关窗。
- **Skill**：
  - 起草 `work.md` 前先搜已关工作的 `result.md`，相关的结论和遗留写进"起因"。
  - 写入 `work.md` 的写法规则。
  - 加收口步骤：会话起草 `result.md`，逐项检查哪些结论该写回：对外约定变了、以后的工作要遵守的决定、还会再踩的环境事实、过程中发现项目文档说错或过时、worker 提示词该改。把写回改动和 `result.md` 摘要放在一屏给人看；人同意后提交写回改动，填好 `路径 @ 提交`，再关窗，最后把 `result.md` 和 `decisions.jsonl` 一起提交。
  - 命令表加收口一行。
- **文档**（中英各一份）：快速开始（两个模板）、决定与证据（关窗）、接续（已关的工作先读 `result.md`）、不装运行时也能参与（写 `result.md`、手写关窗行的新字段、摘要怎么算）、能力矩阵；README 文件树加 `result.md` 一行（中英）。CHANGELOG 新增 `Unreleased`，写明关窗要求 `result.md` 是行为变化。
- 回归测试；`tests/support/package-files.txt` 和插件安装检查加入新模板。

不包含：

- 相关工作之间的关系与外部编号、需求仓与代码仓分开、事实过期检测、从代码反查需求，这些各自另开工作。
- 放弃的工作怎么收口（照旧手写 `cancelled` 行）。
- 自动生成 `result.md`（由会话按 Skill 起草，运行时只核对）、自动改项目文档、新增项目治理模板。
- 改写旧记录或补关老工作；README 文件树以外的部分；发布、推送和版本号（关窗要求 `result.md` 属于行为变化，按主版本还是次版本发，发布时再定）。

## 开工前待拍板

接受本说明即按"推荐"执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 关窗的条件 | 关窗一律要有 `result.md`。没设上线回读的工作，有了 `result.md` 就能关；设了的，照旧要最近一次回读通过 | 维持现状：只有回读通过才能关，`result.md` 可写可不写。不上线的工作继续手写关窗行，或者写只查 Git 的回读脚本 |
| 2 | "写进项目文档"怎么核 | `result.md` 里每条写成 `路径 @ 提交`。关窗时运行时核对三件事：这个提交已经在主干上（和 status 判断"已合并"用同一个分支）、它确实改了这个文件、文件不在本工作自己的目录里。有一条不成立就拒绝关窗；一条都没写就记为"无" | 只记不核：实现省一点，但"已写进 AGENTS.md"又回到靠 AI 自己说 |
| 3 | 合并后还没收口的工作在总览里怎么算 | 单仓 `status` 提示去收口；跨仓总览仍算已了结，只把计数改名为 `merged, not closed`，免得升级后一下冒出几十个老工作 | 算作待办：更不容易忘，但升级后总览会一次列出所有没关窗的老工作 |
| 4 | 接受和关窗时记下原话 | `accept` 和 `decide --action close` 加 `--note <text>`，记下人的原话或理由，在 `status --work` 的决定列表里显示 | 不加：原话继续只写在 `work.md` 或项目自己的决策记录里 |

**对外名字（接受即确认）**

- 文件：`delivery/work/<ID>/result.md`（试点里已有 16 项工作自发用了这个名字）；模板 `templates/v2/result.example.md`。
- 写回行：`- <路径> @ <提交> — <写了什么>`。路径可以加反引号，提交写 7～40 位。
- 关窗记录新增字段：`subject.resultDigest`（`sha256:` 加 64 位十六进制）、`subject.promotions`（`[{path, commit}]`，commit 存完整 SHA）、`note`。设了上线回读的照旧带 `readback`、`commit`、`candidate`。
- `--result` 改为可选，不写时取 `result.md` 里第一行既非空、也不是标题的文字。
- status 原文：
  - 合并后待收口：`merged; close out: write delivery/work/<ID>/result.md, then buildbeat decide --repo <repo> --work <ID> --action close --by <you>`
  - 已关：`closed @ <ts>: <summary> · written into the project: <N>`；关窗后 `result.md` 又改过，再加 ` · result.md changed after closing`
  - 跨仓计数：`merged, not closed <N>`（取代 `merged, no release step <N>`）
- 关窗被拒的原文：
  - `closing a work needs delivery/work/<ID>/result.md (template: templates/v2/result.example.md)`
  - `<path> @ <sha>: unknown commit`
  - `<path> @ <sha>: commit not on <ref>`
  - `<path> @ <sha>: the commit does not change <path>`
  - `<path>: inside the work's own folder, not the project`
- 模板章节原文：
  - `work.example.md`：`Goal` / `Why now` / `Facts checked (<date>, on <commit>)` / `Scope` / `Decisions before starting` / `Acceptance` / `Implementation plan` / `Stop conditions`
  - `result.example.md`：开头一段摘要（不带标题）/ `Decided` / `Left over` / `Written into the project`

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`。
- 回归测试至少覆盖：
  - 关窗：缺 `result.md` 被拒，并提示模板位置；没有 `release:` 的工作有 `result.md` 就能关；有 `release:` 的仍要回读通过；不写 `--result` 时取摘要行，写了以写的为准；关窗行记下 `resultDigest`、`promotions`、`note`；已关的再关被拒（不变）。
  - 写回行：合格行通过（含反引号路径、7 位短 SHA）；未知提交、提交不在主干、提交没改这个文件、路径在本工作目录里，各自被拒并给出对应原文；没写写回行记为空列表；经 merge commit 合入的原提交、squash 后主干上的新提交都认，squash 前分支上的提交被拒。
  - status：合并后待收口的提示原文；已关工作的摘要和写回条数；关窗后改过 `result.md` 的标注；`status --work` 的写回核对结果和原话；跨仓计数改名；没有 `resultDigest` 的旧关窗行显示与 4.2.3 相同。
  - `accept --note` 记入并在 `status --work` 显示；按新字段手写的关窗行能被读出。
  - 装好的包里有两个模板，`work.example.md` 有八节标题。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 本工作自己用新流程收口：写 `result.md`，至少一条写回行经运行时核对通过后关窗。
- 合并后经所有者授权，在试点工作区挑一项已合并、没关窗的工作，用新流程收口一次，记下耗时和卡点。

## 实施计划

1. 运行时：收口逻辑单独成一个模块（读 `result.md`、取摘要行、解析和核对写回行），`closeWork` 改用它；回读条件只在有 `release:` 时生效；`accept` 和 `decide --action close` 加 `--note`。
2. status：提示、已关工作的显示、`--work` 详情、跨仓计数。
3. 模板、Skill、中英文档、README 文件树、CHANGELOG。
4. 回归测试和安装清单。

驾驶会话亲自写代码，以 `--adopt` 交给 Run；verify 和 review 由独立 worker 执行。

## 停止条件

- 范围要扩到"不包含"里的任何一项，先停下来问。
- 发现现有关窗行为被别的路径依赖（比如 3.x 上线回读车道的关窗、已有脚本按旧字段读关窗行），先停下说明影响再定。
- 审查轮数上限 6 轮（run-config `budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
