# 驾驶记录

- 驱动运行时：分支提交 `879c3af` 的冻结副本（`git archive 879c3af` 解包后用 `node <副本>/bin/buildbeat.js`），已包含 WORK-CONTEXT-CLOSEOUT 与 WORK-CODE-TRACE 的改动；本机全局 CLI 为 4.2.3。换会话续跑时，用同一提交重建副本再执行。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写代码，以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-10-25 在对话里说「按推荐接受 WORK-THREADS」，接受记录为 `A-WORK-THREADS-1`（人，经 AI 会话录入），原话记在 `note` 里。
