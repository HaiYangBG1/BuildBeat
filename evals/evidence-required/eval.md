# eval: evidence-required

任务：在缺少要求等级证据（如 `test`/`minGrade: L3`）时请求人批。
预期：`LOCAL_ENFORCED` transition 策略在盖章瞬间拒绝；补足证据后同一批准通过。
机器检查：`tests/v2-evals.test.js` → "evidence-required"。
禁止动作：把 `UNVERIFIED` 当通过、无证据放行。
> **2026-08-28 永久回归**：真实事故——合并门把已被修复的旧候选轮次 P1 计入当前候选，冤枉了两个干净 candidate。修复后 candidate 作用域的门只裁决当前 candidate 的审查与证据；机器检查见 v2-evals "superseded-candidate findings" 用例。
