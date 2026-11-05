# 没跑 Run 就做完的工作，status 认得出"有提交、没收口"，并能生成 result.md 初稿

## 目标

会话直接写代码、不跑 Run 做完的工作，status 一直按"草稿"显示，提示人去"接受"。看进度的人会以为这些事还没做，新会话也会照提示去接受一项早就上线的工作。

做完后：

1. 一项工作没有 Run、没有 run-config、也没关窗，但当前分支上能找到改了 `delivery/` 以外文件、并且能追到这项工作的提交时，`status` 显示 `COMMITTED`，不再显示 `INTENT_DRAFT` / `WORK_DRAFT` 这类草稿状态。下面多一行写明有几个提交、最新一个是哪个，下一步给出收口命令。"有提交"只说明有提交，不代表做完：工作还在做的，接着做就是。
2. `buildbeat decide --repo <path> --work <ID> --action close --draft` 按这些提交写一份 `result.md` 初稿，只写文件、不关窗。
3. 初稿开头带一行标记。标记还在、或者还留着 `<fill in` 占位时，`decide --action close` 拒绝关窗，免得没人看过的初稿被直接关掉。

## 起因

2026-11-05 所有者转来一个业务试点项目的使用反馈（12 条），会话对照代码和试点仓库核实后，建议先做第 1、2、3 条，所有者说「按推荐起草」。这是第 1 条，反馈原话：「有 81 个需求其实早就做完上线了，但因为是会话里直接做的，`status` 里还挂着 INTENT_DRAFT。看进度的人会以为还有 81 件事没做。」

- related: WORK-CONTEXT-CLOSEOUT
- related: WORK-CODE-TRACE

## 已核实的现状（2026-11-05，main `1be6ff7`）

**代码已确认**

- 没有 Run 的工作，状态在 `src/v2/runtime/overview.js:375-401` 里算：没有 plan 时是 `INTENT_ACCEPTED` / `INTENT_DRAFT`，work.md 没接受时是 `WORK_DRAFT`，接受了是 `READY_TO_RUN`。下一步提示都是"接受"或"开跑"；只有接受了又没有 run-config 时，才提示"只改文档的工作可以收口"（`src/v2/runtime/overview.js:396-400`）。
- 关窗本来就不要求接受，也不要求跑过 Run：`closeWork`（`src/v2/runtime/release.js:198-287`）只在有 release 设置或已有回读时要求回读通过，其余只要有 `result.md`。所以"不跑 Run 也能收口"现在就能做，缺的是状态认不出来、提示不说，以及 `result.md` 要从零手写。
- 关窗提示的写法在 `src/v2/runtime/overview.js:350`（`closeOut`），关窗命令的入口在 `src/v2/cli/run.js:1701-1723`，用法行在 `src/v2/cli/run.js:110`。
- 提交和工作的对应关系，`history --path` 已经有一套：`src/v2/runtime/code-trace.js:182-207`（`commitFacts`，一次 `git log` 读出提交时间、标题、`Work:` 标记和改动路径，合并提交按第一父算）和 `src/v2/runtime/code-trace.js:304-309`（运行记录、`Work:` 标记、改了 `delivery/work/<ID>/` 三种线索）。
- `result.md` 的读取和第一行摘要：`src/v2/runtime/closeout.js:113-151`；模板 `templates/v2/result.example.md`。
- status 的速度：`src/v2/runtime/overview.js:197-216` 一次调用内共用缓存（WORK-OVERVIEW-SPEED）。在试点仓库上 `buildbeat status` 现在约 1.4 秒。

**试点仓库（只读，远端开发分支，2026-11-04 的提交）**

- 164 项工作：36 项已关窗；其余 127 项都没有 Run、没有 run-config、没有 `decisions.jsonl`（一项都没接受过），status 全部显示草稿。
- 这 127 项里，117 项能找到改了 `delivery/` 以外文件的提交：110 项靠"同一个提交既改了这项工作的文件夹、又改了代码"就能认出；另外 7 项只有提交标题里写了编号，要等 WORK-COMMIT-TRAILERS 放宽标题线索后才认得出。剩下 10 项没有代码提交。
- 这些工作的 `intent.md` 正文其实已经写了做了什么、合并了哪个提交、上没上线，只是没有 `result.md`、没有关窗行。

**待确认**

- 试点用新运行时跑一遍 status 后，`COMMITTED` 的数目和上面的 117（或本工作单独上线时的 110）对不对得上：在 Run 里只读试跑时确认，写进 notes.md。

## 范围

包含：

- `src/v2/runtime/`：从 `code-trace.js` 提出一个共用的"提交 → 工作"函数，status 和 `history --path` 都用它；status 新增 `COMMITTED`。
- `decide --action close --draft` 写初稿；`closeWork` 认初稿标记。
- 文档：Skill 的会话操作表、指南 11（接续）和指南 12（只用文件）中英文、README 的状态说明（如果有列状态）、CHANGELOG `## Unreleased`。
- 回归测试。

不包含：

- 批量关窗：一项一项看、一项一项关；试点那 117 项要不要用新命令补收口，由试点所有者决定，不在这里做。
- 有 Run 或有 run-config 的工作：状态算法不变（见待拍板第 2 项）。
- 提交标题里的编号算不算线索：归 WORK-COMMIT-TRAILERS。它做完后共用函数多一种线索，`COMMITTED` 自动受益。
- 初稿里写上线回读：没有 Run 的工作现在还记不了回读，归 WORK-RELEASE-ENVS。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 什么算"有提交" | 当前分支（HEAD）上改了 `delivery/` 以外至少一个文件、并且靠 `Work:` 标记或"同一提交改了这项工作的文件夹"追到这项工作的提交；合并提交按第一父算，和 `history --path` 一致 | 只要改过这项工作的文件夹就算：光提交 work.md 的草稿也会显示 `COMMITTED`，等于没区分 |
| 2 | 哪些工作会显示 `COMMITTED` | 没有 Run、没有 run-config、没关窗的工作 | 有 run-config 的也算：本仓"会话先提交、再开 Run 用 `--adopt` 交接"的做法，在提交和开跑之间会被显示成 `COMMITTED`，提示去收口，是误导 |
| 3 | 要不要先接受 | 不要求：试点 127 项一项都没接受过，关窗本来也不要求接受 | 只认接受过的：试点一项都认不出来 |
| 4 | 状态名 | `COMMITTED`：只陈述有提交 | `DONE_NOT_CLOSED`：说成"做完了"，但还在做的工作也有提交 |
| 5 | 初稿入口 | 关窗命令加 `--draft`：人本来就要关窗，提示里就是这条命令 | 新命令 `buildbeat result`：多一条要记的命令 |
| 6 | 初稿必须有人看过 | 初稿开头带标记，标记或 `<fill in` 占位还在就拒绝关窗 | 不加标记：会话可以拿生成的文字直接关窗，`result.md` 对定了什么、剩了什么一字不提 |
| 7 | 性能 | 只有存在第 2 项那样的工作时，才在每个仓库多跑一次 `git log`，并且只读到这些工作里最早的文件夹出现之后的提交；试点上 status 多花不超过 1 秒 | 每项工作各跑一次 `git log`：试点 127 项会明显变慢 |

**对外名字（接受即确认）**

- 状态名：`COMMITTED`
- status 多出的一行（最新提交的标题截到 80 个字符）：
  `  committed: <n> commits on <branch> outside its folder, latest <sha7> @ <YYYY-MM-DD> <subject>`
- 下一步提示：
  `next: if it is done, close it out: buildbeat decide --repo <repo> --work <ID> --action close --draft, edit delivery/work/<ID>/result.md, then buildbeat decide --repo <repo> --work <ID> --action close --by <you>`
- `--json`：这一项多一个 `committed` 字段：`{ "commits": <n>, "first": { "commit", "at", "subject" }, "latest": { "commit", "at", "subject" } }`；其他工作没有这个字段。
- 用法行：`buildbeat decide --repo <path> --work <WORK-ID> --action close --draft`
- 写好初稿后：`wrote delivery/work/<ID>/result.md (a draft from <n> commits); check it against Git and the work, delete its first line, then buildbeat decide --repo <repo> --work <ID> --action close --by <you>`
- 已有 `result.md` 时拒绝：`delivery/work/<ID>/result.md already exists; edit it instead`
- 没有追到提交时拒绝：`no commits on <branch> outside delivery/ trace to <ID>; write delivery/work/<ID>/result.md by hand (template: templates/v2/result.example.md)`
- 初稿未改时关窗拒绝：`delivery/work/<ID>/result.md is still the generated draft; check it, fill in or delete every "<fill in" line and its first line, then close`
- 初稿内容（英文，和模板一致；提交按时间新到旧，最多列 20 个，多的写 `and <k> more`）：

  ```
  <!-- buildbeat draft: check every section against Git and the work, then delete this line -->
  # <ID> result

  Delivered in <n> commits on <branch>, <first date> to <last date>; latest <sha7> "<subject>". Confirmed by <fill in: who checked it, and where it runs>.

  - <sha7> <YYYY-MM-DD> <subject>

  ## Decided
  - <fill in: decisions later readers need, or "none">

  ## Left over
  - <fill in: what was not done and where it went, or "none">

  ## Written into the project
  - <fill in: "path @ commit — what was added or corrected", or "none" and why>
  ```

## 验收

机器检查：

- `verify.sh` 全部通过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑，以及本工作范围内的 `git diff --check`（起点 `1be6ff7`）。
- 新增测试（放进 `tests/v2-closeout.test.js` 或 `tests/v2-overview-stages.test.js`，照现有写法）：
  - 一项工作只有 work.md（没接受），另有一个提交同时改了它的文件夹和 `src/`：status 显示 `COMMITTED`，`committed:` 一行的提交数、最新提交号对；`--json` 有 `committed` 字段。
  - 同样的代码提交改用 `Work: <ID>` 标记、不碰文件夹：同样显示 `COMMITTED`。
  - 只改了文件夹、没改代码的提交：还是原来的草稿状态，`--json` 没有 `committed` 字段。
  - 有 run-config 的工作、有 Run 的工作、已关窗的工作：状态和现在一模一样。
  - `--draft`：写出的文件和上面的格式一致；已有 `result.md` 时拒绝且不改文件；追不到提交时拒绝。
  - 初稿原样关窗被拒；删掉标记行但还留着 `<fill in` 也被拒；改好后关窗成功，关窗行的摘要是初稿第一段改过后的第一行。
  - 新测试在现在的代码上失败（驾驶会话交 Run 前确认，写进 notes.md）。
- 已有测试的断言一条不改照样通过；`history --path` 的输出不变。
- 在本仓和试点仓库上只读试跑 `status`：本仓输出除了耗时一字不变；试点 `COMMITTED` 的项数和"已核实的现状"对得上，有出入写明原因；试点耗时比改动前多不超过 1 秒。结果写进 notes.md。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 在试点的一项工作上用 `--draft` 生成初稿，看初稿是否有用（只看，不关窗，不提交到试点仓库）。

## 实施计划

1. 从 `code-trace.js` 提出共用函数：给定仓库、分支和一组工作，一次 `git log` 返回每项工作追到的代码提交（线索种类沿用 `trailer` / `folder`）；`history --path` 改用它，输出不变。
2. `overview.js`：在没有 Run 的分支里，对没有 run-config、没关窗的工作查这个函数，有代码提交就是 `COMMITTED`，加 `committed:` 一行和收口提示；`--json` 加字段。
3. `release.js` / `closeout.js`：写初稿的函数；`closeWork` 认标记和占位。`run.js`：`--draft` 和用法行。
4. 文档、CHANGELOG、测试。

驾驶会话亲自写代码，提交带 `Work: WORK-COMMITTED-WORKS`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。这项先做，WORK-COMMIT-TRAILERS 和 WORK-RELEASE-ENVS 会用到第 1 步的共用函数，等这项合入会话分支后再开 Run。

## 停止条件

- 已有测试的断言要改：先停下来问。
- 试点试跑时 `COMMITTED` 落在明显没做完的工作上（比如只有一两个准备性的提交），或者耗时超过 1 秒：先停下来问判断规则。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
