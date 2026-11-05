# 驾驶记录

- 驱动运行时：本机全局 CLI 5.4.0。builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写，再以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 做 WORK-COMMITTED-WORKS 时发现：合并决定点 `--adopt` 交回修复后，`status` 提示"merge approved by an AI session"，所有者那时还没批准。会话提成单独任务卡片，所有者说「Do this task here」；会话按说明里的推荐接受三项，记为 `A-WORK-ADOPT-NOT-APPROVAL-1`（AI 会话），所有者没有逐项看 work.md。在会话分支 `claude/caixiaozhi-feedback-00d1e3` 上做，起点 `27effc0`。
- 停止条件里"别处也把交回当成合并批准"：查了所有读 `enter-wait-merge` 的地方——批准命令本来就区分交回（`decisions.js:120-122`），合并门槛和发布回读不看谁批准，只有 `selfMergeApproval` 和 `history --path` 的 `deciders` 两处，都在范围内。
- 和说明不完全一样：台账状态里交回那一行除了 `adopted` 也留了 `resumeAt`（决定行要写"resumed at"）；交回说明也会出现在合并决定点以外的交回（比如 `enter-build`、`enter-fix`）那一行上，同样是实情。
- 新测试 2 条（`tests/v2-final-decision-fix.test.js`），在改动前的代码上（`27effc0`）都失败：第一条是交回后仍提示 AI 自批合并；第二条（交回后人批准、不提示）在旧代码上失败于辅助函数检查台账状态的 `adopted`，它主要用来防回退。
- 本地全量 `npm test` 426 条全过（259 秒）；`npm run check:docs` 通过。候选以 `run --adopt` 交给 RUN-ADOPT-NOT-APPROVAL-01。
- 第 1 轮：verify 通过（约 4 分钟），codex 只读审查 1 条 P1（`ee67a95794704587`）：两处 `history --path` 检查都先补了真正的批准再查，倒序查找先找到它，去掉跳过交回的判断测试也会过。成立。
- 手修 `6777c2f`：先在只有交回、没人批准时手工合并候选，断言 `approved` 为 `null`、文本没有 `approved:` 行；再由会话批准，断言指向那次批准。把 `deciders` 的判断去掉后这条测试失败（指向交回那一行），加上后通过。按"成立、已修"记为 accept（会话），以 `run --adopt` 交回，重验、再审。
- `6777c2f` 以 `run --adopt` 交回（`D-RUN-ADOPT-NOT-APPROVAL-01-2`，回答 enter-fix）。第 2 轮 verify 通过（约 4 分钟），codex 只读审查 0 条问题。Run 停在合并决定，等所有者批准。
- 所有者 2026-11-05 说「批准合并」，记为合并批准 `D-RUN-ADOPT-NOT-APPROVAL-01-3`（人，经 AI 会话录入），Run 终态 SUCCEEDED。候选 `6777c2f` 以 merge commit 合入会话分支。未推送、未发版、未关窗。
