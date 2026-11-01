# 驾驶记录

- 驱动运行时：本机全局 CLI 5.3.0。builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写，以 `run --adopt` 交给 verify 和只读 reviewer。
- 所有者 2026-11-01 说「全部做完，需要我拍板的时候找我」。会话按推荐接受本说明，记为 `A-WORK-GUIDE12-SETUP-1`（AI 会话）。
- 第一次空仓走查（改之前）：只照指南 12 手写文件，接受、带 `Work:` 的提交、写回 AGENTS.md、result.md、关窗都写成了。运行时读回：CLOSED、接受没过期、写回 ✓、`history --path` 能经标记找回工作。发现的两处就是本说明的目标。
- 改完后第二次空仓走查：照新的第 3 步，从 `templates/gitignore.template` 抽出 `delivery/` 那段写进 `.gitignore`。结果是 `delivery/work/W/a.png` 和 `evidence/b.zip` 被忽略，`work.md`、`decisions.jsonl` 不被忽略。手写带 `"decisionRef":"C-WORK-HELLO-2"` 的关窗行后，`status --work` 显示 `C-WORK-HELLO-2 close-work closed by Owner (person)`，不再是「-」。
- 关窗示例照接受的原文写成占位 `C-<ID>-<当前行数+1>`（英文 `C-<ID>-<current line count + 1>`），说明里补了编号规则。文档检查过，中英记录示例形状一致。
- 候选 `3b97cd8` 以 `run --adopt` 交给 Run。
- RUN-GUIDE12-SETUP-01：verify 一次通过（4 分钟），codex 只读审查第 1 轮 0 条。停在合并决定，等所有者批准。
- 所有者 2026-11-01 对整批推荐说「全部按推荐」，记为合并批准 `D-RUN-GUIDE12-SETUP-01-2`（人，经 AI 会话录入）。候选以 merge commit `cf60e96` 合入会话分支 `claude/guide12-setup`。
