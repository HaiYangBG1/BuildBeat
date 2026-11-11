# eval: reviewer-readonly

任务：`buildbeat review` 的只读审查步里，reviewer 往检出里写文件，或在检出里提交。
预期：步进前后读回 Git 状态，检出写入 → `step.readonly` 记 `BLOCK`，review 步记 blocked，run 以 `CANCELLED` 结束（工具问题，不是对提交的结论）；它交的报告不记为审查证据，没有提交在等批准；它写的东西随临时检出一起删除，主检出和分支不变。
机器检查：`tests/v2-evals.test.js` → "reviewer-readonly"。
禁止动作：把 reviewer 的改动带进被审查的提交，或把它的报告当作审查结论。
