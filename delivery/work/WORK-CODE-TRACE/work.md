# 从一行代码找回当初的工作；delivery/ 要进 Git

## 目标

接手一段代码时，人和新会话最常问的是："这段为什么这样写？"答案在当初那项工作里：为什么做、查实了什么、定了什么、审出过什么问题。但现在从代码找不回去，运行时没有任何"从代码查工作"的入口，只能靠提交标题里碰巧写了工作编号，或者人还记得。

本 Work 做两件事：

- 给一个文件（或其中几行），运行时说出这些代码来自哪几项工作，每项附上阶段、标题和 result.md 摘要，追不到的行如实计数。
- 写明并提醒：`delivery/` 要跟代码一起进 Git，不能排除。记录不进 Git，换台电脑、换个人就查不到。

## 起因

所有者 2026-10-25 定了规则：「所有使用buildbeat的都直接放」——需求记录直接放在项目里，跟代码一起进 Git。随后：「先起草第 4 件的 work.md：从一行代码找回当初的工作，顺带写明 delivery/ 要进 Git」。

本 Work 接着 WORK-CONTEXT-CLOSEOUT：已关的工作都有 result.md，摘要可以直接显示。两项工作在同一分支上，都还没进 main。

## 已核实的现状（2026-10-25，分支 `b870803`）

**代码已确认**

- Git 里的运行记录 `delivery/work/<ID>/runs/<RUN>/run-record.json` 存着每轮的 `workspaces.<RUN>.base` 和 `candidate`，所以"起点..候选"之间的提交属于哪项工作，从已有记录就能算出来。取消的轮可能没有候选。
- 运行时交给 worker 的 `BUILDBEAT_INPUT` 里有 `workId`。随包信封 `templates/v2/envelope/worker.sh` 的写入步替模型机械提交，提交信息只有 `<role>: <RUN> attempt <n>`，不带工作编号标记；builder 和 fixer 的提示词都让模型不要自己提交。
- 运行时没有从代码查工作的命令。`history` 只读某一轮的台账（`history --repo <path> --run <RUN-ID>`）。
- 运行时不检查 `delivery/` 是否被 Git 忽略。`templates/gitignore.template` 只排除 `.buildbeat/runtime/` 和 `.buildbeat/worktrees/`，没有说明 `delivery/` 必须进 Git。示例项目的 `worker.sh` 必须与模板逐字节相同（`tests/envelope-worker.test.sh`）。

**试点工作区（只读统计，2026-10-25）**

- 三个代码仓（命令行仓、后端仓、前端仓）自 2026-08-28 以来分别有 111、278、110 个非合并提交。其中落在某轮"起点..候选"范围里、能追到工作的有 71、174、51 个；标题里写了工作编号的只有 24、32、19 个。
- 各仓最常改的 8 个源文件里，这段时间写的行能从运行记录追到工作的：命令行仓 7240 行里 1432 行（20%），后端仓 22775 行里 18786 行（82%），前端仓 4852 行里 3478 行（72%）。命令行仓追不到的大头是几次不带工作编号的大功能提交（最大一次 2949 行），运行记录里也没有它们。
- 五个代码仓都用 `.git/info/exclude` 排除了 `delivery/`，记录只在本机，靠手工拷回主仓。

**运行时待核**

- 试点代码仓的候选经合并请求快进合入，提交保留原 SHA。rebase 合入时 SHA 会变，运行记录追不到，只能靠 `Work:` 标记；squash 合入时标记还在不在，要看平台怎么拼提交信息。用夹具验证 rebase 后标记仍在，squash 的情况如实写进文档。
- 整文件反查的耗时：在试点后端仓的大文件上实测。

## 范围

包含：

- **运行时**：按第 1 项的命令，对文件的指定行（不给行就是当前全部行）在 HEAD 上做 blame，再把每个提交对到工作。对上的线索有三种：
  - 落在某轮的"起点..候选"范围里：读 Git 里的运行记录和本机的运行台账；
  - 提交信息带 `Work: <ID>` 标记；
  - 提交改动了 `delivery/work/<ID>/` 下的文件。

  记录放在调用处所在仓或外层仓的（老布局），只要提交在本仓存在也认，查找方式与 WORK-CONTEXT-CLOSEOUT 的关窗一致。输出每项工作的编号、阶段、work.md 的标题、已关工作的 result.md 摘要，以及去哪里读；追不到的行单独计数；支持 `--json`。
- **信封**：随包 `worker.sh` 的机械提交带上 `Work: <workId>` 标记；示例项目的副本同步，保持逐字节一致。
- **提醒**：`delivery/work/<ID>/` 会被 Git 忽略（`.gitignore` 或 `.git/info/exclude`）时，`accept` 和 `check` 各打印一行提醒，不拦。
- **Skill**：
  - 加一行"这段代码为什么这样 / 是哪项工作改的"的用法；
  - 写明 `delivery/` 要进 Git，不要用 `.gitignore` 或 `.git/info/exclude` 排除；
  - 为某项工作手工提交（手修后 `--adopt`、只改文档的工作）时，提交信息带 `Work: <ID>`。
- **文档**（中英各一份）：快速开始（`delivery/` 进 Git）、接续（接手代码先查是哪项工作）、worker 合同（提交带标记）、不装运行时也能参与（手工提交带标记）、能力矩阵；`gitignore.template` 加一行说明；README 文件树旁加一句"不要排除 delivery/"（中英）；CHANGELOG 新增条目。
- 回归测试；安装清单按需更新。

不包含：

- 提交标题里提到的工作编号（见第 4 项）。
- 强制要求每个提交带标记（见第 2 项）。
- 给旧提交补标记、改写历史。
- 相关工作之间的关系（第 3 件）。
- 试点工作区把记录迁进各代码仓，另起。
- 缓存或索引文件（耗时超过停止条件再定）。
- 发布、推送、版本号。

## 开工前待拍板

接受本说明即按"推荐"执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 命令放哪 | 并进现有的 `history`：`buildbeat history --repo <path> --path <file>[:<line>[-<line>]] [--json]`。"历史"本来就是查过去，不新增命令（4.0 刚把命令合并成五个） | 新命令 `buildbeat why <file>[:<line>]`：更直白，但多一个要记的命令 |
| 2 | `Work:` 标记要不要强制 | 不强制：信封的机械提交自动带，Skill 让会话手工提交时也带；没有标记的提交照样按运行记录找，找不到就如实计为追不到 | 合并决定点要求候选里每个提交都带标记，不带就拒绝：找得更全，但会挡住没升级的信封和手工修复 |
| 3 | `delivery/` 被 Git 忽略时 | `accept` 和 `check` 打印提醒，不拦 | 直接拒绝接受和开跑：逼着立刻迁移，但会挡住还没迁移的仓，包括试点的五个代码仓 |
| 4 | 提交标题里写的工作编号算不算线索 | 不算：只认运行记录范围、`Work:` 标记、工作目录这三种确定的线索。标题里的编号常常是在引用别的工作 | 也算：试点每个仓能多追到二三十个提交，但会把"提到"当成"属于" |

**对外名字（接受即确认）**

- 命令：`buildbeat history --repo <path> --path <file>[:<line>[-<line>]] [--json]`（第 1 项选另一种做法时为 `buildbeat why <file>[:<line>[-<line>]] [--repo <path>] [--json]`）。
- 提交标记：`Work: <ID>`，是标准的 Git 提交标记（trailer），可以有多行。
- 输出原文：
  - 开头：`<file>:<lines> — <N> lines, <M> works`
  - 每项工作一行：`  <ID>  <STAGE>  <title> (<n> lines; via run <RUN-ID> | via Work trailer | via work folder)`，已关的工作下一行 `    result: <summary>`，再下一行 `    read: delivery/work/<ID>/work.md, delivery/work/<ID>/result.md`
  - 追不到：`  not traced to a work: <n> lines in <k> commits`，后面逐个列出提交短 SHA 和标题
- `--json`：`{path, lines, works: [{work, stage, title, summary, lines, via: [{kind: "run"|"trailer"|"folder", run?}], commits}], untraced: {lines, commits: [{commit, subject}]}}`
- 提醒原文：`warning: delivery/work/<ID>/ is ignored by Git here (.gitignore or .git/info/exclude); its records will not travel with the code`
- 信封提交信息：`<role>: <RUN> attempt <n>`，后面空一行再写 `Work: <ID>`。

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`。
- 回归测试至少覆盖：
  - 三种线索各自能把行追到工作：运行记录范围（含同一工作的多轮、被取代的轮）、`Work:` 标记（含 rebase 后标记仍在）、只改工作目录的提交；
  - 同一行对上多项工作时都列出，最近的在前；
  - 追不到的行如实计数；标题里提到编号的提交不算；
  - 只给文件不给行时，按工作汇总当前每一行；行号越界、文件不在 Git 里，各自报错；
  - 记录在外层仓或调用处所在仓（老布局）、提交在本仓的，也能追到；
  - 输出原文和 `--json` 字段；已关的工作显示 result.md 摘要，没关的显示阶段；
  - 信封模板的机械提交带 `Work: <ID>`，示例项目副本与模板逐字节一致；
  - `delivery/` 被 `.gitignore` 或 `.git/info/exclude` 忽略时，`accept` 和 `check` 打印提醒；没被忽略时不打印。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 合并后在试点三个代码仓各挑一个常改的文件实测，记下能追到的比例和耗时，与上面的基线对比。

## 实施计划

1. 运行时：新模块读记录，建"提交 → 工作"对照（运行记录范围、标记、工作目录），实现第 1 项的命令；`accept` 和 `check` 加提醒。
2. 信封模板和示例副本加标记。
3. Skill、中英文档、`gitignore.template`、README 文件树那句、CHANGELOG。
4. 回归测试和安装清单。

驾驶会话亲自写代码，以 `--adopt` 交给 Run；verify 和 review 由独立 worker 执行。

## 停止条件

- 范围要扩到"不包含"里的任何一项，先停下来问。
- 整文件反查在试点后端仓的大文件上超过 10 秒，先停下来，再定要不要加缓存。
- 发现改信封模板会影响已有 Run 的续跑或已冻结的信封摘要，先停下说明影响再定。
- 审查轮数上限 6 轮（run-config `budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
