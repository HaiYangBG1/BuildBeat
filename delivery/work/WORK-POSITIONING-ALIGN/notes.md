# 驾驶记录

- 驱动运行时：本机全局 CLI 5.0.0（与 main `8fd2bc0` 的运行时代码相同：v5.0.0 之后 main 只合入了 README 改版）。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写代码，以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-10-31 在对话里对「history 写上谁拍的板、插件介绍换新定位」这两处说「改吧」。会话按说明里的推荐接受，记为 `A-WORK-POSITIONING-ALIGN-1`（AI 会话），所有者没有逐项看 work.md；随后把现状里两处写成文件名的 decisions.jsonl 改成文字（否则被当成指向 27 个同名文件的指针，列为 not found），重新接受为 `A-WORK-POSITIONING-ALIGN-2`。
- 交 Run 前（RUN-POSITIONING-ALIGN-01 工作树，起点 `916b4c2`）：先写测试、不改 `code-trace.js` 跑 `tests/v2-code-trace.test.js`，新加的那条失败（`approved` 字段不存在）；改完后 9 条全过。这条测试的最近一次合并批准绑定的是没进主干的候选，只看最近一条批准的写法也会失败。
- 在本仓真实记录上用工作树里的运行时跑 `history --path src/v2/runtime/closeout.js:1-40`：WORK-THREADS 和 WORK-CONTEXT-CLOSEOUT 都多出 `approved:`（HaiYangBG1，人，经 AI 会话录入，各自那一轮）和 `closed:` 两行。
- 候选 `f1bdf1d`（`code-trace.js`、回归测试、插件三处文字、CHANGELOG `## Unreleased`）在本地跑完 verify.sh 全过（392 条测试、文档检查、信封、插件、安装后首跑、`git diff --check`）后以 `run --adopt` 交给 Run。
- RUN-POSITIONING-ALIGN-01：候选 `f1bdf1d` 以 `run --adopt` 交接（`D-RUN-POSITIONING-ALIGN-01-1`，AI 会话），verify 一次通过（4 分钟），codex 只读审查第 1 轮 0 条问题（它自己在本仓真实记录上跑了 `history --path` 核对新输出）。停在合并决定，等所有者批准。
- 所有者 2026-10-31 看过插件四段原文后说「批准并开 PR」，记为 `D-RUN-POSITIONING-ALIGN-01-2`（人，经 AI 会话录入）；Run 终态 SUCCEEDED。合并另行决定。
