# WORK-REVIEW-CIRCLING 结果

一项工作连续几轮审查都审出 P0、P1 时，`review` 每满 5 轮打印一行 `stop:`，叫会话先别接着修、把情况拿给用户；`status` 显示 `blocking streak: <n> reviews in a row found blocking problems`，`--json` 每行带 `blockingStreak`。所有者批准的提交是 `6bdb781`，经 PR #137 以 merge commit `4f868e1` 合入 `main`，还没发版。验证通过（348 项测试和其余门禁），codex 只读审查 4 轮。

## 定了什么

- 只提示不拦，门槛固定 5，不加配置键；用户说继续，就到 10、15……轮再问。见 work.md「开工前待拍板」和 `decisions.jsonl` 的接受记录。
- 只认审查者自己的报告（`review-<n>.json`），验证器写的不算；验证没过、工具故障没审到的轮次不计也不清零；没等过人就以 `CANCELLED` 结束的那轮不算；被人拒绝的那轮算审完、没有阻断问题，清零。
- 已合并、已关、已取消的工作不显示连续轮数；`cost` 对象的形状不变，数放在行上。
- 只统计 6.x 自己跑的运行（`pass: true`）。审查者认为这一点超出了接受时的说明，所有者驳回了这条（指纹 `ff2b59c2db2c8126`）：旧版运行在一次运行里会重试、等人，记录分不清哪份报告是审完的。

## 剩下什么

- 待合并的 PR #136（WORK-SINGLE-TOOL）也改了 `SKILL.md`、`CHANGELOG.md` 和 `src/cli/run.js`，它合并时要解一次冲突，由那项工作处理。
- 发版等所有者另说。

## 写进了项目哪些文档

- SKILL.md @ d240336 — 「一轮审查怎么收场」加看到 `stop:` 就停下找用户、怎么问；「找用户只在这几处」加上审查连续几轮不收
- docs/guide/02-workflow-guide.md @ d240336 — 说明连续轮数怎么算、`stop:` 何时出现、看到后怎么做
- docs/guide/02-workflow-guide.en.md @ d240336 — 同上的英文版
- CHANGELOG.md @ 6bdb781 — 未发布条目说明 `stop:`、`blocking streak`、计数规则和只认当前版本的运行
