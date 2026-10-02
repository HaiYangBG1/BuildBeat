# Plan:会话手修交回时不丢批准过的额度(WORK-ADOPT-GRANTS)

## 修改范围

`src/v2/runtime/orchestrator.js`(`resumeRun` 选取 grants 的一处判断)、`tests/`、`docs/v2/guide/07-approval-guide.md` / `.en.md`、`CHANGELOG.md`。
不改 reducer、事件、`decisions.js`。

## 实现顺序

1. **grants 选取**(`resumeRun` 批准分支):目前只有 `canonicalJson(requestData.subject) === canonicalJson(approval.subject)` 时采用 `requestData.grants`。
   增加一种情况:该批准对应的 `DECISION_RECORDED` 事件带 `adopted`(即 `resume --adopt` 回答的请求),且
   `approval.subject.planDigest === requestData.subject.planDigest`,则同样采用 `requestData.grants`。
   用 resumeRun 里已经定位到的 `decisionIndex` 读 `ledger.events[decisionIndex].data.adopted`,不改 reducer。
   其余路径(`APPROVAL_STALE` 之后、普通批准 subject 不一致、钉在第一条 `BUDGET_EXTENDED` 上的放行计划)保持不变。
2. **测试**(加到 `tests/v2-budget-false-stops.test.js`,沿用其 in-process fixture):
   - `reviewTriage: required`、`budgets.maxAttempts.review: 2`,review 脚本前 2 轮各出 1 个 P1、第 3 轮通过;
     跑到第 2 轮后停 `enter-fix` 且请求带 `grants: [{ step: "review", scope: "run" }]`;
     在 worktree 写一个文件并提交,`adoptCandidate(..., { sha, resumeAt: "verify" })`,再 `resumeRun`;
     断言:落了 review 的 `BUDGET_EXTENDED`(`approvalRef` 为 adopt 的决定),review 第 3 轮已执行,Run 停在合并决定,
     整个过程中 `resume-review` 预算停车一次都没有出现;
   - 已有「a refreshed request cannot reuse grants from the previous request」继续通过(普通批准不受影响)。
3. **抢锁测试收尾**(`tests/v2-stale-locks.test.js`「processes racing for one stale lock」):
   用 `t.after` 保证无论断言成败都写入 `done` 文件并结束仍存活的子进程;等待 `reported` 时若子进程提前退出也要结束等待,不挂住测试。
4. **文档**:审批指南(中英)预算停车一节补一句「会话手修后用 `resume --adopt` 回答该请求,同样继承请求上的 grants」;
   `CHANGELOG.md` `Unreleased` 加一条。

## 风险

- adopt 换了候选,仍继承 grants 是有意为之:grants 属于「这一轮」的批准,不属于某个候选;planDigest 不一致时不继承,避免跨计划沿用。

## 测试方法

verify 步跑 `npm test && npm run check:docs`;新测试先在修复前确认失败。

## 回滚方式

Run 分支不合并即无影响;改动是一处条件判断,revert 即回到旧行为。
