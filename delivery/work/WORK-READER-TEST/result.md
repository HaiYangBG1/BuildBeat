# WORK-READER-TEST 结果

多了一条命令 `buildbeat reader --repo <path> --work <ID> [--doc work|result]`：把一份 work.md 或 result.md 交给一个只看得到这份文档的只读 AI，它在项目之外的空目录里回答固定问题，答案、答不出的清单和核对结果记进 `delivery/work/<ID>/reader-tests.jsonl`。所有者批准的提交是 `3860ca5`，在会话分支 `claude/open-source-project-review-9d8d4f` 上，没有推送，没有发版。这是第一项用这个分支上的新运行时（`node bin/buildbeat.js review`）送审的工作。

数字：`src` 8,336 行（线是 8,400）；测试 344 项全部通过；独立审查 8 轮（原定上限 6，后两轮经所有者同意）。

## 本仓实测（2026-11-11，codex exec 只读，每份约 1 分钟）

| 文档 | 大小 | 答出 | 答不出的条数（测了两次的写两个） | 核对 |
|---|---|---|---|---|
| WORK-SELF-001 result.md | 0.8 KB | 4/4 | 4 | 提交 ✓ |
| WORK-BUDGET-FALSE-STOPS result.md | 0.9 KB | 4/4 | 7 | 提交 ✓ |
| WORK-LIVE-FACTS result.md | 2.2 KB | 4/4 | 6 | 提交 ✓ |
| WORK-FINAL-DECISION-FIX result.md | 2.5 KB | 4/4 | 5 | 提交 ✓ |
| WORK-CLEAN-START result.md | 3.6 KB | 4/4 | 8、7 | 提交 ✓，写回文档 ✓ |
| WORK-README-REDESIGN work.md | 3.1 KB | 6/6 | 6、9 | 不核对 |
| WORK-FINAL-DECISION-FIX work.md | 4.4 KB | 6/6 | 2、5 | 不核对 |
| WORK-CROSS-REPO-STATUS work.md | 5.9 KB | 6/6 | 7、6 | 不核对 |
| WORK-THREADS work.md | 7.9 KB | 6/6 | 5、6 | 不核对 |
| WORK-CONTEXT-CLOSEOUT work.md | 12.6 KB | 6/6 | 8、6 | 不核对 |
| WORK-READER-TEST work.md | 9.4 KB | 6/6 | 9、7 | 不核对 |

读出来的：

- 答不出的清单逐条看是有用的，每份文档都被指出几处没写清的地方，而且具体。读这项工作自己的说明时，读者指出验收要人看实测表、实施计划却把实测排在合并之后，这是真的自相矛盾。
- 条数不稳：同一份文档两次最多差 3 条，内容也不完全一样。它不是分数。
- 篇幅和答不出的条数没有看出关系。只有 11 份，不下结论。
- 读者没有翻仓库：答案都在文档里找得到出处。
- 这些实测的记录没有留在各项工作的文件夹里：它们是用后来去掉的那项核对生成的，留着会误导。本工作自己的记录留着。

## 定了什么

- work.md 第 4 项原定核对三项，实际只核对 result.md 的两项。work.md 的"要改哪些目录或文件"对照实际改动这一项去掉了：工作说明不逐个列文件；算到一项工作头上的提交里有发版和合并，带进别的文件；`CHANGELOG` 和 `CHANGELOG.md` 这种写法差别也判错。实测五份全错，给不出信息。所有者 2026-11-11：「去掉再审一轮」。
- 答不出的清单逐条看，不数条数，不比较，不设线。写进了指南。
- 核对写回文档时不从读者的答案里拆路径，而是拿 Git 确认过的路径去答案里找。审查前三轮的问题都出在"从句子里拆路径"上。
- 读者运行的空目录是一个没有提交的新 Git 仓库：真实工具在不是仓库的目录里拒绝运行。
- 旧版本配置的工作（自己的 run-config.yaml 是旧写法）做读者测试时退回用项目配置。
- 读者的命令和参数里指向仓库内文件的相对路径，由运行时换成绝对路径；`envelope.vars` 照常代入。

## 剩下什么

- 一次读者测试花多少钱没量，只知道约 1 分钟。
- `status` 把早已在后续提交里修掉、没人裁决的审查问题一直标成 `(open)`，这项工作收尾时列着 9 条。它们不拦批准，但看着像没处理。上一项工作就记过，值得单独修。
- 读者测试自己的 work.md 被读者指出的几处没写清，没有回头补：说明已接受，这项工作已做完。
- 发 6.0.0、推送、合入 `main`、README 配图、试点仓只读核对、路径里的 `v2` 改名：仍等所有者另说。

- follows: WORK-CLEAN-START

## 写进了项目哪些文档

- SKILL.md @ b72cb2b — 会话操作表加一行：什么时候做读者测试、结果给谁看
- docs/v2/guide/07-approval-guide.md @ 3860ca5 — 读者测试一节：给读者什么、核对哪两项、清单怎么看
- docs/v2/guide/07-approval-guide.en.md @ 3860ca5 — 同上，英文
- docs/v2/guide/02-workflow-guide.md @ b72cb2b — 配置里可选的 `workers.reader`
- CHANGELOG.md @ 3860ca5 — 未发布条目里的读者测试
