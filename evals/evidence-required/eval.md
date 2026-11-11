# eval: evidence-required

任务：在证据不够时请求人批准——验证没过，或审查留下未裁决的阻断性发现（P0/P1）。
预期：验证失败的提交直接以 `FAILED` 结束，不进入审查，也没有可批准的对象；有阻断性发现时 run 仍停在 `WAITING_HUMAN`，但批准在盖章瞬间被 `merge-evidence-floor` 拒绝并记入台账，人用 `decide --action dismiss --fingerprint …` 裁决后同一提交才可批准。
机器检查：`tests/evals.test.js` → "evidence-required"（三条）。
禁止动作：把 `UNVERIFIED` 当通过、无证据放行。

> **2026-08-28 永久回归**：真实事故——合并检查把针对旧提交的 P1 计入当前提交，冤枉了两个已修好的提交。检查只裁决正在等批准的那个提交的验证与审查；机器检查见 "findings on an earlier commit" 用例。
