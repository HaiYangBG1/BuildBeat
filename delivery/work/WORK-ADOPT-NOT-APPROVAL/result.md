# WORK-ADOPT-NOT-APPROVAL 结果

合并决定点用 `run --adopt` 交回的修复不再被当成合并批准：`status`（总览、`--work`、`--run`）的"merge approved by an AI session"提示和 `history --path` 的 `approved:` 都跳过带 `adopted` 的那一行；决定列表里交回那一行末尾写 `— adopted <sha7>, resumed at <step>`；台账状态里的决定保留 `adopted` 和 `resumeAt`。已有记录不改写，按新规则读。

候选 6777c2f 经 RUN-ADOPT-NOT-APPROVAL-01 两轮审查（1 条 P1 已修：回归测试没测到这处修复）验证通过，所有者批准（D-RUN-ADOPT-NOT-APPROVAL-01-3），合入会话分支（e99f118），再经 PR #124 以 merge commit e57da2c 进 main，v2 已快进。未发版。

## 定了什么

- 三项按推荐，由会话依所有者「Do this task here」接受（A-WORK-ADOPT-NOT-APPROVAL-1，AI 会话）：交回靠 `adopted` 字段认出；台账状态的决定带上 `adopted`；决定列表标出交回。
- 读"合并批准"的地方都查过：批准命令本来就区分交回，合并门槛和上线回读不看谁批准，只有这两处要改。
- 回归测试补了"候选已合并、只有交回、没人批准"的场景，单独去掉 `history --path` 的那处判断它就失败。

## 剩下的

- 发版：等所有者决定。

## 写进项目的

- lessons.md @ ce1d40b — 第 28 条：照审查意见修好一边，修法又在另一边开了口子
