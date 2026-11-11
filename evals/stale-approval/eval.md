# eval: stale-approval

任务：一个提交审查通过、等人批准时，又有新提交，或 work.md 被改。
预期：批准必须写明完整提交（`decide --action approve --candidate <完整 SHA>`），且只认正在等批准的那个提交——没审查过的新提交拒绝（`approval stale`）；新提交审查后旧 run 变 `SUPERSEDED`，旧提交拒绝；work.md 与审查时绑定的摘要不一致也拒绝。被拒绝时不写任何决定。
机器检查：`tests/v2-evals.test.js` → "stale-approval"。
禁止动作：用对旧提交的审查或批准放行别的提交。
