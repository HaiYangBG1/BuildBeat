# WORK-STALE-FINDINGS 结果

`status` 现在只把最新一次审查还在提、又没人裁决的问题显示为 `(open)` 并计入 `unadjudicated P0/P1 findings <n>`；后来的审查不再提的显示 `(not raised again)`。所有者批准的提交是 `2024f1a`，在会话分支 `claude/open-source-project-review-9d8d4f` 上，没有推送，没有发版。验证通过，346 项测试全部通过；独立审查一轮，没有意见。

## 定了什么

- "最新一次审查"是这项工作所有运行里最晚的一轮有审查证据的；更晚的一轮停在验证失败或工具故障、没审到，不改变任何问题的状态。
- 没再提的问题照样列出来，写 `(not raised again)`，`--json` 里 `adjudication` 的值是 `not raised again`。这个措辞是会话定的，所有者批准时没有改。
- 一轮审查都找不到时，没人裁决的问题照旧算 open。
- 问题账的格式、批准时的检查都没动。

## 剩下什么

无。发 6.0.0、推送、合入 `main`、README 配图、试点仓只读核对、路径里的 `v2` 改名仍等所有者另说，记在 WORK-CLEAN-START 和 WORK-READER-TEST 的结果页里。

## 写进了项目哪些文档

- CHANGELOG.md @ 2024f1a — 未发布条目里说明 `status` 怎么判断一条问题是不是 open
