# 发稳定版时由发布流程自动把 next 挪过去，不再手动登录 npm

## 目标

发稳定版时，发布流程把包发到 `latest` 之后，用同一次可信发布（OIDC）的身份把 `next` 也挪到这个版本；校验任务确认两个标签都对。做完后，发一个稳定版不再需要任何人登录 npm、输入验证码或在网页上确认。

## 起因

2026-11-19 发 6.1.0 和 6.2.0 时，`next` 都要所有者登录 npm、再做一次网页验证才能挪（第一次还遇到 EOTP，改走网页验证），链接用过一次就 404。所有者说：「我希望将npm发布变成自动的，不希望每次都手动登录」。

- related: WORK-REVIEW-CIRCLING
- related: WORK-SINGLE-TOOL

## 已核实的现状（2026-11-19，`2e2e7c6`）

**已确认**

- 发布本身已经不用登录：`publish.yml` 用可信发布，`publish` 任务有 `id-token: write`，在 `npm-publish` 环境里跑（`.github/workflows/publish.yml:22-31`）；稳定版发到 `latest`、预发布版发到 `next`（`.github/workflows/publish.yml:57-68`），实际发布在 `.github/scripts/publish-candidate.sh:69-93`。
- 两个任务都钉在 npm 11.19.0（`.github/workflows/publish.yml:49-50`、`.github/workflows/publish.yml:153-154`），文档检查要求这一行存在（`tests/check_docs.py:696`）。
- 校验任务对稳定版只查 `latest`（`.github/workflows/publish.yml:185-209`）。
- 手册写着 `next` 只给预发布用（`docs/RELEASING.md:12-15`），而实际每次稳定版后都手动把 `next` 挪到同一版本（CHANGELOG 的 6.0.0、6.1.0、6.2.0 发布段落）。
- npm 官方文档（docs.npmjs.com/trusted-publishers，2026-10-06 版）写明：可信发布的 OIDC 身份也能做 `npm dist-tag add/rm`，但要维护者在包的可信发布设置里勾选「Allow npm dist-tag」，默认关闭；要求 npm CLI 11.21.0 或更高。
- npm 11.21.2 发布于 2026-11-04（`npm view npm time`），满两周。

## 范围

做：

- 新脚本 `.github/scripts/follow-next.sh`：稳定版发布后把 `next` 挪到这个版本；`--check` 只读核对。
- `publish.yml`：两个任务的 npm 升到 11.21.2；`publish` 任务在发布之后调用这个脚本；校验任务对稳定版也核对 `next`。
- 测试（模拟 npm）、文档检查的片段、`docs/RELEASING.md` 的渠道说明和一次性设置步骤。

不做：不动 `npm-publish` 环境的人工批准（批准走 GitHub，不用登录 npm）；不用长期令牌；不改预发布的路由。

## 开工前待拍板

所有者已明说要自动，下面按推荐做；要改哪项直接说。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 怎么做到不登录 | 用发布流程已有的 OIDC 身份执行 `npm dist-tag add`，所有者在 npm 网站上一次性勾选「Allow npm dist-tag」 | 在 GitHub 里存一个长期 npm 令牌：仓库规则禁止长期发布令牌，令牌泄露就能改包 |
| 2 | `next` 正指着更新的预发布版时 | 不动它：`next` 的版本号核心比这次发的稳定版大（比如 `7.0.0-beta.1` 对 `6.3.0`）就保留，只打一行说明 | 总是覆盖：正在测的预发布版会被挤掉 |
| 3 | 挪 `next` 失败时 | `publish` 任务失败、写明原因（多半是没勾选设置）；勾上后点「重跑失败的任务」，发布那步会认出已发的同一份包、直接接着挪 `next` | 只警告不失败：`next` 落后没人发现，最后又回到手动登录 |
| 4 | 不挪 `next` 的情况下手册怎么写 | 改成「稳定版也把 `next` 挪到同一版本，除非 `next` 是更新的预发布版」 | 维持「`next` 只给预发布」：和实际做法不符 |

## 验收

机器检查，过全套门禁：`npm test`、`npm run check:docs`、`npm run test:envelope`、`npm run test:plugin`、`npm run test:pack-firstrun`、`npm run pack:check`，另加 `bash -n`、shellcheck、actionlint。新测试（模拟 npm）覆盖：

- 稳定版、`next` 指着旧稳定版：执行 `npm dist-tag add @haiyangbg/buildbeat@<版本> next`。
- `next` 已经是这个版本：不执行，退出 0。
- `next` 指着版本核心更大的预发布版：不执行，退出 0。
- `next` 指着版本核心相同或更小的预发布版：执行。
- `dist-tag add` 失败：退出非 0，错误里写明去勾选「Allow npm dist-tag」。
- 预发布版：脚本什么都不做。
- `--check`：上面几种情况下只读、按同样的规则判断对错。

只有人或线上能确认：所有者在 npm 网站勾选设置；下一次稳定版发布时 `next` 自动挪过去。

## 实施计划

1. 写 `follow-next.sh` 和测试。
2. 改 `publish.yml`、文档检查片段、`docs/RELEASING.md`。
3. 跑门禁，送审。

## 停止条件

- npm 文档的要求和实际不符（下一次发布时 OIDC 挪不动 `next`）：停下，告诉所有者。
- 要用长期令牌才能做到。
