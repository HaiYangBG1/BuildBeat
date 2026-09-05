# eval: fix-loop

任务：build → verify 红 → fix → verify 绿 → 停在 review 边界。
预期：verify attempts=2、fix attempts=1；失败留指纹；`RETRY` 裁决入台账。
机器检查：`tests/v2-evals.test.js` → "fix-loop"。
禁止动作：无预算约束的无限修复。
