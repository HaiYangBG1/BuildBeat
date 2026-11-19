# WORK-AUTO-NEXT 结果

发稳定版不再需要任何人登录 npm：发布流程把包发到 `latest` 后，用同一次可信发布（OIDC）的身份把 `next` 挪到这个版本，校验任务核对两个标签。所有者批准的提交是 `5b2fcd4`，经 PR #144 以 merge commit `e9ee93f` 合入 `main`，还没发版。codex 只读审查 6 轮。要到下一次发稳定版才能在线上确认生效，而且所有者要先在 npmjs.com 勾一次「Allow npm dist-tag」。

## 定了什么

- `next` 只往前挪：它已经是更新的版本（预发布或稳定版）就不动。补发或重跑较低的旧版本时，`next` 停在较新的版本上，真遇到时手动挪。这是第 5 轮触发 `stop:` 后所有者选的「缩小范围」，比接受时的说明宽（说明里只保留更新的预发布版）；所有者为此驳回两条（`4a240f959de116db`、`81b402c545c31dd4`）。
- 读不到 `next` 就停、什么都不改；挪失败时任务失败，并写明去勾「Allow npm dist-tag」，勾上后重跑失败的任务即可。
- 已经发布了同一版本时，重跑只要求打标签的提交在 `main` 的历史里，所以 `main` 往前走了也能重跑恢复；这时发布步骤只接受完全相同的包。
- 发布全局排队一次一个（并发组 `npm-publish`，`queue: max`），排队中的不会被取消。两个任务的 npm 升到 11.21.2。
- 没有用长期令牌；`npm-publish` 环境的人工批准不变（走 GitHub，不用登录 npm）。

## 剩下什么

- 所有者在 npmjs.com 打开 `@haiyangbg/buildbeat` → Settings → Trusted publishing，勾选「Allow npm dist-tag」。下次发稳定版前要做。
- 下次发稳定版时确认 OIDC 真能挪动 `next`；挪不动就按 work.md 的停止条件停下告诉所有者。
- 第 6 轮剩一条 P2：预发布版仍直接发到 `next`，补发一个更旧的预发布版会把 `next` 拨回去。这是原有行为，这次没改。
- 本机 actionlint 1.7.12 不认识 `queue`，`.github/actionlint.yaml` 只为发布流程忽略这一条；actionlint 支持后可以删掉这条配置。

## 写进了项目哪些文档

- docs/RELEASING.md @ 5b2fcd4 — 渠道表和说明：稳定版之后 `next` 跟上、只往前挪、一次性设置「Allow npm dist-tag」、重跑恢复和发布排队；npm 版本改为 11.21.2
- CHANGELOG.md @ 5b2fcd4 — 未发布条目说明发版不再需要登录 npm
