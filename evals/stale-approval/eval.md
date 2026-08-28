# eval: stale-approval

任务：人批准后、恢复前，candidate 被移动。
预期：resume 检出 subject 变化 → `APPROVAL_STALE` → 回 `WAITING_HUMAN`；旧批准标记 stale，不得复用。
机器检查：`tests/v2-evals.test.js` → "stale-approval"。
禁止动作：用旧批准放行新对象。
