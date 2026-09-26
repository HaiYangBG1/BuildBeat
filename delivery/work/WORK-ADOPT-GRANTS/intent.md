# Intent:会话手修交回时不丢批准过的额度(WORK-ADOPT-GRANTS)

## 为什么做

WORK-BUDGET-FALSE-STOPS 让「review 轮次用完 + 发现阻断问题」只停一次 `enter-fix`:
请求上带 `grants`,批准即放行「修复 + 重验 + 再审一轮」。但 `resume` 只在**批准的 subject 与请求完全一致**时才采用请求的 `grants`。

会话亲自修复、用 `resume --adopt <sha>` 交回时,adopt 按设计把候选换成新提交,subject 必然不同,`grants` 被丢掉:
重验通过后 Run 又停在 `resume-review`「review budget exhausted」,同一轮问了第二次——正是上一个 Work 要消除的误停车,
而且偏偏出现在所有者要求的工作方式(会话亲自修 finding、adopt 交回)里。实际发生过:一个 Run 在第 2 轮 review 后先停 `enter-fix`,adopt 之后又停 `resume-review`。

## 目标

- adopt 回答一个带 `grants` 的请求时,`resume` 照样落这些 `BUDGET_EXTENDED`;adopt 之后的重验、再审一轮不再停车;
- 其余情况保持现状:普通批准仍要求 subject 一致;请求被刷新(`APPROVAL_STALE`)后的批准不继承旧 grants;
- 顺带(上一个 Work 的 review P2):`tests/v2-stale-locks.test.js` 的多进程抢锁测试在断言失败时也要让子进程退出,不能挂住测试。

## 非目标

- 不改预算数值、grants 的计算方式、事件格式与 reducer;
- 不改 adopt 本身的校验(树干净、HEAD 等于给定 sha);
- 不 merge、不 push、不发版。

## 验收条件

- 新测试复现真实场景:`reviewTriage: required`、review 上限 2,第 2 轮 review 发现阻断 → 停 `enter-fix`(带 grants)→
  在 worktree 提交修复并 `adoptCandidate` → `resumeRun`:落一条 review 的 `BUDGET_EXTENDED`,重验后直接跑第 3 轮 review,中间不再停人;
  该测试在修复前失败(停在 `resume-review`);
- 回归:普通批准 subject 不一致时仍不采用 grants(已有的「refreshed request」测试继续通过);
- 抢锁测试:任一断言失败时子进程都会被结束;
- `npm test` 与 `npm run check:docs` 全绿;审批指南(中英)说明 adopt 同样继承 grants;CHANGELOG `Unreleased` 同步。

## 止损线

- 最多 2 个 Run;review 累计最多 2 轮(`budgets.reviewRoundsPerWork: 2`);
- 墙钟超过 2 小时未到合并决定,停下先问人。
