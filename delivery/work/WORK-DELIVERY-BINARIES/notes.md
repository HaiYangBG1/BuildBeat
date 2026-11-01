# 驾驶记录

- 驱动运行时：本机全局 CLI 5.1.0（与 main `a8f24c5` 的运行时代码相同）。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写代码，以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-11-01 在对话里说「做进 BuildBeat」（把底座迁移时定下的「截图、压缩包、日志不进 Git，超大文件提醒」做进产品）。会话按说明里的推荐接受，记为 `A-WORK-DELIVERY-BINARIES-1`（AI 会话），所有者没有逐项看 work.md。
- 交 Run 前（RUN-DELIVERY-BINARIES-01 工作树，起点 `9cc0420`）：先写三条测试、不改代码和模板跑 `tests/v2-code-trace.test.js`，三条都失败；改完后 12 条全过。
- 真实环境只读试跑：用工作树里的 `heavyRecordsWarning` 扫试点工作区底座主仓 94 项、四个已迁移代码仓 46 项、ruoyi-ai 45 项工作，0 条提醒——截图和压缩包都已被各仓新加的忽略规则挡住，ruoyi-ai 的 `delivery/` 整个被本地排除（由「被忽略」那条提醒负责）。
- 候选 `5d0cf89`（`overview-repos.js` 新提醒、`run.js` 两处调用、两份模板、文档、CHANGELOG、测试）本地跑完 verify.sh 全过（395 条测试、文档检查、信封、插件、安装后首跑、`git diff --check`）后以 `run --adopt` 交给 Run。
- RUN-DELIVERY-BINARIES-01：候选 `5d0cf89` 以 `run --adopt` 交接，verify 一次通过（4 分钟），codex 只读审查第 1 轮 0 条问题。停在合并决定，等所有者批准。
- 所有者 2026-11-01 看过提醒原文后说「批准并开 PR」，记为合并批准（人，经 AI 会话录入）；Run 终态 SUCCEEDED。合并另行决定。
