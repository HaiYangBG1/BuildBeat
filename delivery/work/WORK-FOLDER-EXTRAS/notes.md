# 驾驶记录

- 驱动运行时：本机全局 CLI 5.2.0（与 main `895653e` 的运行时代码相同）。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写，再以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-11-01 问工作记录有没有规范、会不会塞满垃圾和日志。会话盘点后提议，所有者说「做进 BuildBeat」。会话按说明里的推荐接受，记为 `A-WORK-FOLDER-EXTRAS-1`（AI 会话）；所有者没有逐项看 work.md。
- WORK-LIVE-FACTS 也在 CHANGELOG 新开 `## Unreleased`，为免冲突，等它合入会话分支以后才开这项的 Run。所有者「批准并继续」后，WORK-LIVE-FACTS 以 `48e3ad8` 合入 `claude/live-facts`，本项从那里开分支 `claude/folder-extras`。RUN-FOLDER-EXTRAS-01 起点是 `fce3a40`。
- 交 Run 前，在 RUN-FOLDER-EXTRAS-01 工作树里先写两条测试，不改代码跑 `tests/v2-code-trace.test.js`：两条都失败，原因是没有提醒（实际得到 null），不是样例出错。改完后 14 条全过。
- 真实环境只读试跑，用工作树里的 `extraFilesWarning` 扫所有工作：
  - BuildBeat 本仓 31 项里 1 项提醒：WORK-PR70-REVIEW，13 个文件，是那次独立审查留下的 PR 说明、比对结果和审查脚本。
  - 试点工作区主仓 94 项里 55 项提醒，与已提交文件的盘点（55 项）一致。最多的三项是 699、179、153 个文件。还没提交的截图已被忽略规则挡住，不计数。
  - 四个代码仓 46 项工作，0 项提醒。
  - 没有提醒落在明显正常的工作上，门槛不用改。
- 候选 `a644819`（新提醒、`accept` 和 `check` 两处调用、文档、CHANGELOG、测试）本地跑完 verify.sh 全过（397 条测试、文档检查、信封 20/20、插件 7/7、安装后首跑 17/17、`git diff --check`），然后以 `run --adopt` 交给 Run。
- RUN-FOLDER-EXTRAS-01：候选 `a644819` 以 `run --adopt` 交接，verify 一次通过（3 分钟），codex 只读审查第 1 轮 0 条问题。停在合并决定，等所有者批准。
- 所有者 2026-11-01 说「批准并开 PR」，记为合并批准 `D-RUN-FOLDER-EXTRAS-01-2`（人，经 AI 会话录入）；Run 终态 SUCCEEDED。候选以 merge commit `8088fe1` 合入会话分支 `claude/folder-extras`。
