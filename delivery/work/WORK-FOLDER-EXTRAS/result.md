# WORK-FOLDER-EXTRAS 结果

工作文件夹只放这项工作的记录，过程材料不放进去。`accept` 和 `check` 发现 `delivery/work/<ID>/` 里记录以外的文件超过 10 个时打印一行提醒，列出按路径排序的前 5 个和总数；只提醒，不拦。已经进了 Git 的和下一次提交要加的都算，被忽略的、已经删掉的不算。Skill、README 的文件说明、指南 12（中英）写明：命令输出、回读结果、一次性脚本不放进去，结论写进 `result.md`，以后还要用的脚本放进项目自己的目录。

候选 a644819 经 RUN-FOLDER-EXTRAS-01 验证一次通过，codex 只读审查第 1 轮 0 条。所有者批准（D-RUN-FOLDER-EXTRAS-01-2）后，候选以 8088fe1 合入工作分支，再经 PR #111 以 merge commit b8f0289 进 main，v2 已快进。未发版。

## 定了什么

- 开工前四项由会话按推荐接受（A-WORK-FOLDER-EXTRAS-1），依据是所有者说的「做进 BuildBeat」，所有者没有逐项看 work.md。四项是：
  - 记录指运行时写或读的那几份：`work.md`、`intent.md`、`plan.md`、`result.md`、`env-facts.md`、`run-config*.yaml`、`decisions.jsonl`、`review-findings.jsonl`、`releases.jsonl`、`runs/<RUN>/run-record.json`；
  - 门槛是超过 10 个；
  - 已提交的和将要提交的都数；
  - 只在 `accept` 和 `check` 提醒。
- 已提交的文件也要数：读者看到的是整个文件夹。只数「下一次提交会带进去的」不行，会话每次只加几个，就永远不会触发提醒。
- 只读试跑：本仓 31 项提醒 1 项（13 个文件），试点工作区主仓 94 项提醒 55 项（和盘点一致，最多的一项 699 个），四个代码仓 46 项提醒 0 项。没有提醒落在正常的工作上。
- 它和 WORK-LIVE-FACTS 都在 CHANGELOG 新开同一个「Unreleased」小节，所以等 WORK-LIVE-FACTS 合入工作分支后才开 Run，PR #111 叠在 #110 上。

## 剩下的

- 发版：等所有者决定。提醒要到发版后的运行时才有。
- 试点工作区主仓里 55 项工作已经提交的过程材料不动：它们已在 Git 历史里，删了也不会让仓库变小；要不要从当前目录里清掉，由所有者定。

## 写进项目的

- 无。规则和提醒写在 Skill、README、指南和 CHANGELOG 里，都随候选一起进了主干，没有另外要写回的项目文档。
