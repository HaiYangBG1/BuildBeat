# 驾驶记录

- 驱动运行时：main 提交 `61a7f3b` 的冻结副本（`git archive 61a7f3b` 解包后用 `node <副本>/bin/buildbeat.js`），已包含 WORK-FACT-POINTERS 的改动；本机全局 CLI 为 4.2.3。换会话续跑时，用同一提交重建副本再执行。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写代码，以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-10-25 在对话里说「Accept WORK-FACT-DIR-POINTERS as drafted, with all three recommendations.」，接受记录为 `A-WORK-FACT-DIR-POINTERS-1`（人，经 AI 会话录入），原话记在 `note` 里。所有者随后说「Go ahead: write the run config, verify.sh and the fix here, hand the commits to a Run with run --adopt, review to convergence and stop at the merge decision.」
