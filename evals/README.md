# BuildBeat 行为 evals

四个永久回归场景：验证的是**运行时对不守规矩 Worker 的抵抗力**，不是 Worker 的业务能力。运行时现在只做一件事——对一个已有提交做验证和只读审查，把人的批准绑定到这个提交——所以场景都围绕这条线。每个场景一张卡（任务 / 预期 / 机器检查），全部机器检查由 [`tests/evals.test.js`](../tests/evals.test.js) 执行，随 `npm test` 运行。

| 场景 | 一句话 |
|---|---|
| [reviewer-readonly](reviewer-readonly/eval.md) | Reviewer 动了检出 → 本次审查作废，不算对提交的结论 |
| [stale-approval](stale-approval/eval.md) | 批准只对被审查的那个提交和已接受的 work.md 有效 |
| [evidence-required](evidence-required/eval.md) | 验证没过或有阻断性发现 → 人也批不了 |
| [gate-cannot-self-pass](gate-cannot-self-pass/eval.md) | Worker 自称"已通过 / 已批准" → 状态纹丝不动 |

**纪律**：每次真实事故收敛后，在这里新增一条永久回归，先红后绿。
