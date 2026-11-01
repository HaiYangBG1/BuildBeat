# 驾驶记录

- 驱动运行时：本机全局 CLI 5.2.0（与 main `895653e` 的运行时代码相同）。
- builder 和 fixer 不配 worker：驾驶会话在 Run 工作树里亲自写，再以 `run --adopt <sha>` 交给 verify 和只读 reviewer。
- 所有者 2026-11-01 讨论「要不要给项目建项目上下文文件、会不会和 AGENTS.md 冲突、错的上下文比没有更糟」之后说「先改模板」。会话按说明里的推荐接受，记为 `A-WORK-LIVE-FACTS-1`（AI 会话）；所有者没有逐项看 work.md。
- RUN-LIVE-FACTS-01（起点 `fde5704`）：先只加新检查、不删文件，跑文档检查，只命中 `example/BUILDBEAT.md`（`@haiyangbg/buildbeat@3.0.0`），没有别的文件。所以停止条件第二条没触发。
- 删文件后，链接检查发现 `docs/history/retired-skill/07-templates-and-lessons.md:10` 用相对链接指向被删的模板。work.md 写的是「历史文档保持原样」，所以没有越界硬改：
  - 在 build 之前停掉 RUN-LIVE-FACTS-01，`stop` 的理由写明是范围要补。
  - work.md 范围补一项：这一个链接改指 v5.2.0 的 GitHub 地址，文字不改。
  - run-config 的 `allowedPaths` 补上这个文件。
  - 重新接受，记为 `A-WORK-LIVE-FACTS-2`；再以 `--new` 开 RUN-LIVE-FACTS-02（起点 `97105da`），把 01 工作树里的提交 `2213404` 原样拣过来，得到 `d85c417`。
- 交 Run 前在 RUN-LIVE-FACTS-02 工作树里临时改动确认两道检查（改完都已还原，工作树干净）：
  - 往 `templates/v2/AGENTS.md` 加一行 `npm install --global @haiyangbg/buildbeat@5.2.0`：新检查报 `templates/v2/AGENTS.md: pins a runtime version (@haiyangbg/buildbeat@5.2.0); …`，原有的「安装行必须用 @latest」也报了。改成 `@latest` 后通过。
  - 把 `example/BUILDBEAT.md` 放回来：报 `removed scope must not return`，同时报版本写死。删掉后通过。
  - `npm publish --dry-run`：112 个文件（之前 114 个）。
- 本地跑完 verify.sh 全过（395 条测试、文档检查、信封 20/20、插件 7/7、安装后首跑 17/17、`git diff --check`），然后候选 `d85c417` 以 `run --adopt` 交给 Run。
- RUN-LIVE-FACTS-02：候选 `d85c417` 以 `run --adopt` 交接，verify 一次通过（3 分钟），codex 只读审查第 1 轮 0 条问题。停在合并决定，等所有者批准。
- 所有者 2026-11-01 说「批准并继续」，记为合并批准 `D-RUN-LIVE-FACTS-02-2`（人，经 AI 会话录入）；Run 终态 SUCCEEDED。候选以 merge commit `48e3ad8` 合入会话分支 `claude/live-facts`，还没开 PR、没进 main。
