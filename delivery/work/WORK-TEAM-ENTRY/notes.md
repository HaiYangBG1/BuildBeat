# 驾驶记录

- 驱动运行时：main 提交 `61a7f3b` 的冻结副本（`git archive 61a7f3b` 解包后用 `node <副本>/bin/buildbeat.js`），已包含 WORK-FACT-POINTERS 及之前的改动；本机全局 CLI 为 4.2.3。换会话续跑时，用同一提交重建副本再执行。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写，以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 接受记录 `A-WORK-TEAM-ENTRY-1` 是会话的决定（agent），依据是所有者 2026-10-25 在对话里说的「先做完，再说合并的事」；所有者没有逐项看过这份 work.md，开工前四项按推荐，原话记在 `note` 里。
