# 从范围外挪进来的文件也会被范围检查拦下；读 Git 输出不再受个人设置左右

## 目标

Run 的 `allowedPaths` 是一道硬边界：worker 交回结果、或者驾驶会话用 `--adopt` 交候选时，运行时列出相对起点改过的路径，有一条在范围外就停下等人。但它列路径时开着 Git 的改名检测：把范围外的文件 `git mv` 到范围内，只列出新路径，范围外那一侧的删除从来没被检查，边界就漏了。

本 Work 让范围检查看到挪动的两边。顺带按 CONTRIBUTING.md 新加的那条规则（解析给人看的 Git 输出时，钉住用户设置能改变的东西），把运行时其余读 `diff`、`log`、`blame`、`status` 的地方过一遍，补上实测会出错的几处。其中一处已经会让人用不了：用户全局设了 `blame.ignoreRevsFile`、仓里又没有那个文件时，`history --path` 直接报错。

## 起因

驾驶 WORK-FACT-POINTERS 的会话在收口时发现这个缺口：那项工作的收口在 CONTRIBUTING.md 加了解析 Git 输出的规则，对照它看 `listChangedPaths` 时发现改名没关。2026-10-25 交代先起草本说明、不实现，交所有者决定。

- related: WORK-FACT-POINTERS
- related: WORK-FINAL-DECISION-FIX
- related: WORK-CODE-TRACE

WORK-FINAL-DECISION-FIX 给合并决定点上的 `--adopt` 加了范围检查；WORK-CODE-TRACE 写了 `history --path` 的 blame 和 log 读法；本 Work 修这两处读 Git 输出的方式。

## 已核实的现状（2026-10-25，main `e863477`）

**代码已确认**

- 范围检查只有一个路径来源 `listChangedPaths`（`src/v2/workspace/workspace-manager.js:342-365`），两处用它：`--adopt` 交候选（`src/v2/runtime/decisions.js:358-363`，报 `out-of-scope changes: …`），worker 交回结果（`src/v2/runtime/orchestrator.js:1220-1245`，记一条 `workspace.scope` BLOCK 并停下等人）。
- 已提交的一半用 `git -c core.quotepath=off diff --name-only <base>..HEAD`（`src/v2/workspace/workspace-manager.js:348-356`），没关改名检测。函数上方的注释自己写着 "Rename lines keep only the new path"（`src/v2/workspace/workspace-manager.js:342-343`）。
- 工作区的一半用 `status --porcelain` 按行读，遇到 `old -> new` 只留新路径（`src/v2/workspace/workspace-manager.js:357-363`）。
- `--adopt` 先要求工作树干净（`src/v2/runtime/decisions.js:340-345`），所以交候选时只有已提交那一半起作用；worker 交回结果时两半都起作用。
- 判断工作树脏不脏的 `readback` 用的是不带参数的 `git status --porcelain`（`src/v2/workspace/workspace-manager.js:336-340`）。钉候选、`--adopt`、只读步骤前后对比、verify 缓存都靠它（例如 `src/v2/runtime/orchestrator.js:847-849`）。
- `core.quotepath=off` 是 2026-08-28 一次真实事故后加的（`3f39189`：中文文件名被当成范围外），回归测试在 `tests/v2-invariants.test.js:132-146`。合并决定点上 `--adopt` 拒绝范围外改动的测试在 `tests/v2-final-decision-fix.test.js:103-121`，worker 改到范围外的 eval 是 `evals/plan-scope/eval.md`。没有一条测试涉及挪动文件。

**草稿仓实测（Git 2.54，用户配置为空）**

- 提交 `git mv secret/x.txt src/x.txt` 后，`diff --name-only` 只出新路径 src/x.txt；加 `--no-renames` 出 secret/x.txt 和 src/x.txt 两条。用户设 `diff.renames=copies` 时，不加参数仍只出新路径。
- 同样的挪动只暂存不提交，`status --porcelain` 出 `R  secret/x.txt -> src/x.txt`；`-z` 下是 `R  src/x.txt`、`secret/x.txt` 两段，新路径在前；加 `--no-renames` 出 `D  secret/x.txt` 和 `A  src/x.txt`，用户设了 `status.renames=copies` 也一样。
- `core.quotepath=off` 只管非 ASCII。含双引号或制表符的路径仍被引号包住输出（`"src/a\"b.txt"`），拿去比前缀必然对不上，范围内的文件也会被拦。`-z` 下原样输出。
- 用户设了 `status.showUntrackedFiles=no` 时，`status --porcelain` 一个未跟踪文件都不列，工作树里多了新文件也算干净。不设时，新目录只列成目录名（如 newdir/），`--untracked-files=all` 才逐个文件列出。命令行参数压过用户设置。
- `color.ui=always` 不给 `diff --name-only`、`status --porcelain`、`log --format`、`blame --line-porcelain` 加颜色；`diff.external` 不影响 `--name-only`。这几条调用不受颜色和外部 diff 影响。

**`history --path`**

- blame 调用没有钉 ignore-revs（`src/v2/runtime/code-trace.js:59-76`）。用户全局设了 `blame.ignoreRevsFile=.git-blame-ignore-revs`、本仓又没有这个文件时，git 报 `fatal: could not open object name list` 退出。在本仓实跑 `history --repo <本仓> --path src/v2/runtime/gc.js:32-37`，得到 `error: Command failed: git … blame …`；去掉这项配置就正常列出。命令行加 `--no-ignore-revs-file` 能清掉它，`--ignore-revs-file=""` 和 `-c blame.ignoreRevsFile=` 都清不掉。
- git 的报错原文在这里被丢掉（`src/v2/runtime/code-trace.js:30-37` 把 stderr 设成 `ignore`），人只看到 "Command failed"。
- 每个提交的时间、标题、`Work:` 标记和改动路径一次读出（`src/v2/runtime/code-trace.js:168-185`），钉了 `core.quotePath=false`，没钉改名、签名和 `-z`：
  - 改名开着。一个提交把 `delivery/work/<ID>/` 里的文件挪走，路径只列新位置，按文件夹认工作（`src/v2/runtime/code-trace.js:263-266`）就认不出那项工作。
  - 用户设 `log.showSignature=true` 时，签名检查的文字（实测 `No signature`）打在下一条记录的分隔符之前，被当成上一个提交改过的路径。不会认错工作，但路径里混进了杂项。
  - 路径按行切后再 `trim()`，首尾带空格的路径被改掉；含引号、制表符的仍被引号包住。
  - 没有路径参数，`log.follow` 不起作用。

**其余读 Git 输出的地方**

- 收口读提交改了哪些文件用 `diff-tree … --no-renames -z`（`src/v2/runtime/closeout.js:191-195`），合规。
- 清理读 `worktree list --porcelain`（`src/v2/runtime/gc.js:48-55`）：给脚本用的格式，不在规则列的四类命令里；比对的工作树路径是 BuildBeat 自己生成的。
- 信封读钉住提交里的文件用 `git show <pin>:<path>`（`src/v2/runtime/envelope.js:45-54`）：实测用户配的 textconv 不作用于 `show` 一个 blob。
- 规则本身和 facts.js 目前只在 WORK-FACT-POINTERS 的分支上（`97bf3fd`，规则在那里 CONTRIBUTING.md 第 47 行）。facts.js 的 diff、补丁和 log 调用都已钉齐（`--no-renames -z`、a/ 和 b/ 前缀、`--no-color --no-ext-diff`、`log.follow=false`、`log.showSignature=false`），引号包住的路径按"变了"计，不需要改。

**待核**

- `status --no-renames` 从哪个 Git 版本起有：印象是 2.18，仓里没写最低 Git 版本。开跑时核对发布说明，写进 CHANGELOG 条目。
- `--untracked-files=all` 在大仓的 Run 工作树里多花多少时间：开跑时在本仓测一次；试点后端仓由所有者下次开跑时看。

## 范围

包含：

- **范围检查的路径**（`listChangedPaths`）：
  - 已提交的一半改为 `diff --name-only --no-renames -z <base>..HEAD`。
  - 工作区的一半改为 `status --porcelain -z --no-renames --untracked-files=all`。
  - 按 NUL 读，挪动的两边各成一条，不再切 ` -> `；含引号、制表符、首尾空格的路径原样比对；注释改成实话。
- **工作树脏不脏**（`readback`）：改为 `status --porcelain --untracked-files=normal`，不受 `status.showUntrackedFiles` 左右。
- **`history --path`**：
  - blame 加 `--no-ignore-revs-file`。
  - log 加 `--no-renames`、`-z`、`-c log.showSignature=false`、`-c log.follow=false`，按 NUL 读路径，不再 `trim()`。
- **CONTRIBUTING.md**：那条规则补两项：`blame` 加 `--no-ignore-revs-file`，`status` 写明 `--untracked-files=<mode>`。
- **CHANGELOG** Unreleased 新增两条（原文见下）。
- **回归测试**，见验收。

不包含：

- 清理读 `worktree list --porcelain`、信封读 `git show`：理由见现状。
- 收口和 facts.js：已合规，不动。
- 被 `.gitignore` 忽略的文件、子模块：范围检查本来就不看它们，本 Work 不改这点。
- `history --path` 把 git 报错原文丢掉、只显示 "Command failed"：改完 ignore-revs 后这一种报错不会再出现；把报错原文带出来另起一项。
- SHA-256 仓：blame 只认 40 位提交号（`src/v2/runtime/code-trace.js:69`），64 位的仓追不到任何行。另起一项。
- lessons.md 和 evals/：这是读代码发现的，没出过真实事故（CONTRIBUTING.md：只收真实事故）。
- 版本号、发布、推送。

## 开工前待拍板

接受本说明即按"推荐"执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 挪动怎么算 | 算两处改动：原位置删除、新位置新增，两边都要在范围内。diff 和 status 都加 `--no-renames`，解析时不用认 `old -> new`。**行为变化**：以前只要新位置在范围内就放行的挪动，现在要把原目录也写进 `allowedPaths` | 保留改名检测，把 R、C 两种条目的两个路径都取出来：结果一样，但要多认一种格式（`-z` 下新路径在前、旧路径另起一段，用户设 copies 时还有 C 条目），解析多一个分支 |
| 2 | 路径怎么读 | `-z`，按 NUL 切。含引号、制表符、` -> `、首尾空格的路径原样读出 | 只加 `--no-renames`、继续按行读：改动最小，但含引号或制表符的路径继续被引号包住，范围内的文件也会被拦 |
| 3 | 未跟踪文件 | 范围检查用 `--untracked-files=all`，逐个文件列出；`readback` 用 `--untracked-files=normal`，只判断有没有 | 不动：用户全局设了 `status.showUntrackedFiles=no` 时，worker 留在范围外的新文件发现不了，只读步骤写了新文件也看不出来 |
| 4 | `history --path` 的 blame 认不认 ignore-revs | 一律不认（`--no-ignore-revs-file`）：每行按真实历史归到写它的提交；用户全局设了而仓里没有那个文件时不再报错 | 文件存在时认它：格式化提交可以跳过，但同一行在不同人的机器上会追到不同的工作 |
| 5 | `history --path` 的 log 关不关改名 | 关：挪走或删掉的工作文件夹也算这个提交碰过。一次把 `delivery/work/OLD/` 改名成 `NEW/` 的提交会同时认出两个工作 | 开着：只认新位置，挪走的那个工作认不出 |
| 6 | 实测不起作用的设置要不要也钉 | 不钉：颜色、外部 diff、补丁前缀只影响补丁和着色输出，这几条调用实测不受影响；在代码注释里写一句为什么没加 | 照规则全写上：一眼能对上规则，但每条调用多几个不起作用的参数 |
| 7 | 什么时候开工 | WORK-FACT-POINTERS 合入 main 之后，从 main 开工。规则和 facts.js 那时都在 main，本 Work 在规则上补两项 | 现在就从 main 开工：范围检查的漏洞早一点补上，但 CONTRIBUTING.md 会和那条分支冲突，规则只能等两边都合入后再补 |

**对外名字（接受即确认）**

- 命令、选项、文件名：没有新增。
- 报错原文不变：`out-of-scope changes: <path>, …`（`--adopt`）、`worker changed paths outside the allowed scope: <path>, …`（worker 交回结果）。挪动时列出的是范围外那一侧，例如 `out-of-scope changes: secret/x.txt`。
- CHANGELOG Unreleased 新增两条：
  - `The scope check sees both sides of a move (WORK-SCOPE-RENAMES). **Behaviour change:** moving a file from outside allowedPaths into it is now out of scope, because the old path is deleted; before, only the new path was checked. Paths are read with -z, so names with quotes, tabs or leading spaces are compared as they are, and untracked files are listed one by one whatever status.showUntrackedFiles says.`
  - `history --path no longer fails when your Git config sets blame.ignoreRevsFile to a file the repository does not have, and ignores that setting, so a line traces to the commit that wrote it on every machine; log.showSignature no longer adds stray paths.`

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`。
- 回归测试至少覆盖：
  - 已提交的挪动：`allowedPaths` 只有 `src`，提交 `git mv secret/x.txt src/x.txt`，`listChangedPaths` 列出 `secret/x.txt` 和 `src/x.txt`；合并决定点上 `--adopt` 以 `out-of-scope changes: secret/x.txt` 拒绝，台账不变（加进 `tests/v2-final-decision-fix.test.js` 的拒绝场景）。
  - 暂存的挪动：同样的挪动只 `git mv` 不提交，`listChangedPaths` 列出两条；worker 交回这样的结果时，Run 记 `workspace.scope` BLOCK 并停下等人，不钉候选。
  - 挪动后又改了内容（`RM`）、从范围内挪到范围外、在范围内互相挪，各自判对。
  - 在临时用户配置下（`diff.renames=copies`、`status.renames=copies`、`status.showUntrackedFiles=no`），`listChangedPaths` 和 `readback` 的结果与空配置一致。
  - 路径含中文、双引号、制表符、` -> `、首尾空格时原样列出；未跟踪的新目录逐个文件列出；现有的中文文件名测试照过。
  - `history --path`：临时用户配置设 `blame.ignoreRevsFile` 指向不存在的文件、`log.showSignature=true` 时，输出与空配置逐字一致；挪走工作文件夹里文件的提交能按文件夹认出那项工作。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 所有者看一眼 CONTRIBUTING.md 补的两项措辞。不需要在生产或试点工作区确认。

## 实施计划

1. 范围检查和 `readback`：读 status 和 diff 的参数按范围一节改，按 NUL 解析。
2. `history --path`：blame 和 log 的参数按范围一节改，路径按 NUL 读。
3. 回归测试。
4. CONTRIBUTING.md 补两项，CHANGELOG 两条。

驾驶会话亲自写代码，以 `--adopt` 交给 Run；verify 和 review 由独立 worker 执行。

## 停止条件

- 开工时 WORK-FACT-POINTERS 还没合入 main：先问（第 7 项）。
- 现有测试或本仓已关工作的运行记录里，有以前放行、改完被拦的真实挪动：停下列给所有者，再定第 1 项。
- `--untracked-files=all` 让本仓一次范围检查多出 1 秒以上：停下再定第 3 项。
- 范围要扩到"不包含"里的任何一项，先停下来问。
- 审查轮数上限 6 轮（run-config `budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
