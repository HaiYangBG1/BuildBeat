# 驾驶记录

- 驱动运行时：main 提交 `61a7f3b` 的冻结副本（`git archive 61a7f3b` 解包后用 `node <副本>/bin/buildbeat.js`），已包含 WORK-FACT-POINTERS 的改动；本机全局 CLI 为 4.2.3。换会话续跑时，用同一提交重建副本再执行。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写代码，以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-10-25 在对话里说「Accept WORK-FACT-DIR-POINTERS as drafted, with all three recommendations.」，接受记录为 `A-WORK-FACT-DIR-POINTERS-1`（人，经 AI 会话录入），原话记在 `note` 里。所有者随后说「Go ahead: write the run config, verify.sh and the fix here, hand the commits to a Run with run --adopt, review to convergence and stop at the merge decision.」
- 交 Run 前（RUN-FACT-DIR-POINTERS-01 工作树，起点 `c5cf444`）：先写测试、不改 `facts.js` 跑 `tests/v2-fact-pointers.test.js`，新加的那条和 `parseFacts` 那条都失败（`docs/`、`docs/:3` 解析成 `plugin/docs`，`nowhere/` 列为 not found；解析结果多出三个 `docs/`）。改完后 8 条全过。
- "待核"那一条：在本仓用修好的 `facts.js` 重跑临时现状（docs/、docs、templates、example、src/v2/、src/lib/、missing-dir/、docs/:3，加上 facts.js 一行和 plugins/buildbeat/docs），只剩后两条，"2 pointers, 0 changed"；临时工作目录已删。
- RUN-FACT-DIR-POINTERS-01：起点 `c5cf444`，驾驶会话在 Run 工作树提交候选 `0aa186a`（`facts.js` 修复、回归测试、CHANGELOG 一句），本地跑完 verify.sh 全过（391 条测试、文档检查、信封、插件、安装后首跑、`git diff --check`）后以 `run --adopt` 交给 Run（`D-RUN-FACT-DIR-POINTERS-01-1`）。verify 一次通过；codex 只读审查第 1 轮 0 条问题（它自己复现了起点上的 docs/ 错配，并核对了斜杠排除、整条路径目录优先、后半段文件照旧）。停在合并决定，等所有者批准。
- 所有者 2026-10-25 说「Approve candidate 0aa186afc4e4ac149349358995bd1fd1beffdc5f for RUN-FACT-DIR-POINTERS-01 at the merge decision (enter-wait-merge). Merging and pushing stay separate decisions.」，记录为 `D-RUN-FACT-DIR-POINTERS-01-2`（人，经 AI 会话录入）；Run 终态 SUCCEEDED。合并、推送另行决定。
