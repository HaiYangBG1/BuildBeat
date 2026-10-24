# 驾驶记录

- 驱动运行时：`main` `4a25344` 的冻结副本（`git archive 4a25344` 解包后用 `node <副本>/bin/buildbeat.js`），包含尚未发布的决定身份记录；本机全局 CLI 为 4.2.3。换会话续跑时，用同一提交重建副本再执行。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写代码，以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-10-25 在对话里说「按推荐接受 WORK-CONTEXT-CLOSEOUT」，接受记录为 `A-WORK-CONTEXT-CLOSEOUT-1`（人，经 AI 会话录入）。
