# 跨仓总览从半分钟降到几秒：同一份台账只读一次，合并检查一次列完

## 目标

在试点工作区的主仓里跑 `buildbeat status --repo . --all-repos`，本机要 31～35 秒。这条命令是开会话时看全局的第一眼，太慢就没人用。

做完后，同一次 `status` 里：

1. 每个仓库的运行台账只解析一次，各项工作的运行、成本和工作编号扫描共用这一份。
2. 「候选进没进主干」用一次 `git rev-list <主干>` 列出主干上的全部提交来查，不再每个候选单独起一个 `git merge-base`。不是完整提交号、或者主干历史太长列不出时，照旧用 `merge-base`。
3. 文字输出和 `--json` 输出与改之前逐字节相同。

## 起因

2026-11-01 所有者让会话把待办全部做完（「全部做完，需要我拍板的时候找我」），其中一项是 10-25 记下的「跨仓总览要 26～28 秒」。会话让一个只读的子代理做了剖析，没有改动任何仓库。结论：

- 时间花在两处。台账解析 19.3 秒：245 个台账文件一共被打开 20,390 次，同一份最多 124 次，读了 402 MB，而数据只有 5 MB。起 Git 子进程 13.6 秒，其中 `merge-base --is-ancestor` 102 次，占 10.7 秒。
- 本机每起一次 git 平均要 106 毫秒，因为 PATH 里第一个 `git` 是双推包装器，要经过三层才到真正的 git；直接调 git 是 6.6 毫秒。这只是本机的情况，减少起进程的次数在哪台机器上都有用。
- 用临时预加载脚本模拟两处改法：35.0 秒降到 4.8 秒，git 子进程从 129 次降到 28 次；绕过包装器时只要 1.1 秒。文字输出和 700 KB 的 JSON 逐字节相同。

- related: WORK-CROSS-REPO-STATUS

## 已核实的现状（2026-11-01，main `0277d27`）

**代码已确认**

- `src/v2/runtime/overview.js:107-135`（`runsFor`）每调用一次，就把 `.buildbeat/runtime/runs` 下的全部台账打开一遍，再挑出这项工作的。每项工作调用一次。
- `src/v2/runtime/work-cost.js:116-126`（`computeWorkCost`）同样每调用一次就把全部台账打开一遍。`src/v2/runtime/overview.js:460` 对每项有运行的工作调用一次。
- `src/v2/runtime/overview.js:184-192` 每次 `computeOverview` 都把全部台账扫一遍，收集工作编号。`src/v2/runtime/overview.js:211-214` 对每项转到代码仓的工作递归调用 `computeOverview`，于是又扫一遍。
- `src/v2/runtime/overview.js:173-175`（`overviewContext`）是一次 `status` 共用的上下文，已经缓存了仓库根、HEAD 和祖先关系。`src/v2/runtime/overview.js:588` 跨仓总览对所有仓库共用这一个上下文。
- `src/v2/runtime/overview.js:73-88`（`isAncestor`）每个没缓存过的候选起一个 `git merge-base --is-ancestor`。
- 写台账的路径各自打开自己的 `EventLedger`，`append` 会改它的事件、状态和大小，所以缓存不能做成全局的，只能限于一次只读的总览。
- `tests/v2-cross-repo-status.test.js:305-337` 数这条命令起了哪些 git 进程。`tests/v2-cross-repo-status.test.js:330-331` 断言 `merge-base` 正好 2 次（「共享的候选在每个所属仓库各查一次」）。

## 范围

包含：

- `src/v2/runtime/overview-repos.js` 新增 `readRunLedgers(repoRoot)`：列出一个仓库全部运行台账，读法和现在的两处循环一样。
- `src/v2/runtime/overview.js`：上下文里加台账缓存和主干提交集合；`runsFor` 可以接收已读好的台账，不给时照旧现读；工作编号扫描、`runsFor`、`computeWorkCost` 在总览里都用缓存；`isAncestor` 改用主干提交集合，不行时退回 `merge-base`。
- `src/v2/runtime/work-cost.js`：`computeWorkCost` 可以接收已读好的台账，不给时照旧现读。
- 回归测试；`tests/v2-cross-repo-status.test.js:330-331` 那条断言要改（见待拍板第 3 项）。
- CHANGELOG `## Unreleased`。

不包含：

- 转到代码仓的工作在全仓视图里附带单项详情（决定列表、写回核对）。剖析发现这是递归时把 `work` 当筛选条件传下去带出来的，去掉会让 JSON 少 133 KB，单仓文字输出也会少一块。这会改输出，要所有者另定。
- `listInbox`、`typicalDurations` 里各自再读一遍台账：每个仓库只读一次，量小。
- 每个仓库把 `rev-parse --show-toplevel` 和 `--abbrev-ref HEAD` 合成一次：省 5 次进程，本机约 0.5 秒，收益小。
- 台账解析本身（`reducer.js` 每个事件 `structuredClone`）：属于冻结的规格，缓存以后已经不显著。
- 绕过 PATH 里的 git 包装器：本机的推送规则靠它。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 台账缓存放在哪 | 放在一次 `status` 的上下文里，只读，命令结束就丢 | 在 `EventLedger.open` 做全局缓存：改动更少，但写台账的路径会拿到同一个对象，状态会串 |
| 2 | 主干历史很长怎么办 | `rev-list` 输出超过 64 MB（约一百五十万个提交）就放弃，退回逐个 `merge-base` | 设一个提交数上限：要多一次查数，收益不大 |
| 3 | 改已有测试的断言 | `tests/v2-cross-repo-status.test.js:330-331` 改为：`merge-base` 0 次，`rev-list` 每个所属仓库 1 次；同一行「Git 查询不重复」的断言照旧 | 不改：留着就等于禁止这次优化 |

**对外名字（接受即确认）**

- 命令、选项、输出：都不变。
- CHANGELOG：`` `status` is faster on big workspaces (WORK-OVERVIEW-SPEED): within one call each repository's run ledgers are read once and shared by every work's runs, cost and the work-id scan, and whether a candidate reached the main branch is answered from one `git rev-list` of that branch instead of a `merge-base` process per candidate (it falls back to `merge-base` for anything but a full commit id, or a history too long to list). Output is unchanged. In a pilot workspace the cross-repository overview went from about 31 s to a few seconds. ``（最后一句的数字按实测改）

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`（起点 `0277d27`）。
- 新增测试：
  - 一个仓库里有 6 项工作、各带运行台账，跨仓总览里每份台账最多被打开 2 次（总览一次、待决定列表一次）；改之前在现在的代码上失败。
  - 合并检查：完整提交号不再起 `merge-base`，每个仓库和主干只起一次 `rev-list`；已合并和未合并的候选判断都对。缩写提交号退回 `merge-base`，结果相同。
- 已有测试只改上面第 3 项那一处断言，其余一条不改照样通过。
- 在试点工作区只读对比：同一份数据，改前（全局 5.3.0）和改后（本工作的候选）跑 `status --repo . --all-repos` 及其 `--json`，输出逐字节相同；把两边的耗时写进 notes.md。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 无。

## 实施计划

1. `readRunLedgers` 和上下文缓存；`runsFor`、`computeWorkCost` 加可选参数，扫描和调用处改用缓存。
2. `isAncestor` 改用主干提交集合，带退回。
3. 测试；改那一处断言。
4. 试点只读对比和计时；CHANGELOG。

驾驶会话亲自写代码，提交带 `Work: WORK-OVERVIEW-SPEED`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。

## 停止条件

- 试点对比时输出有任何一字不同：先停下来查，不靠改测试过关。
- 要改的已有断言超过第 3 项那一处：先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
