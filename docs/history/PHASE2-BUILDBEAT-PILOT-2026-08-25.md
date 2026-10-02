# Phase 2-B WP2.8 BuildBeat namespace real-directory pilot — 2026-08-25

> 本报告记录 BuildBeat canonical namespace 的新真实目录试点。它与旧名 WP2.7 证据分开，不把 legacy Solobaton 路径或 hash 改写成 BuildBeat 证据。

## 结论

WP2.8 已在三个全新的隔离目录完成并关闭：CLI default `init`、Tide 隔离副本的 compact `adopt`、Skill-only 手动 Bootstrap 均只生成 BuildBeat canonical namespace，项目级占位符清零，Git/Hook/本地提交与可复跑门禁闭合。两套 CLI 安装的 `doctor` 为 0 error / 0 warning；Skill-only 为 0 error，只保留预期的 `manifest.missing` warning。用户于 2026-08-25 明确确认关闭 WP2.8，但不提交源仓。

这组证据证明当前源码候选能在真实目录落下 `BUILDBEAT.md`、`.buildbeat/manifest.json`、BuildBeat managed marker 与相应布局；WP2.8 Gate3 已由用户确认。该确认只关闭本地 namespace 工作包，不证明 npm 已发布、GitHub 远端已改名、浏览器 UI 已验收或生产已上线，也不授权源仓 commit。

## 授权、目标与非目标

用户在确认产品名为 BuildBeat 后要求继续执行，并在候选 review-ready 后明确确认关闭 WP2.8、但不提交源仓。授权覆盖以下新隔离目录内的 dry-run、apply、语义渲染、本地 Git、规范 Hook、验证、evidence commit 与关闭证据提交；不覆盖源仓库 commit、push、tag、GitHub Release、GitHub 仓库改名、npm package 决策、npm publish、部署或生产访问。

| 路径 | 入口 | 试点边界 |
|---|---|---|
| `~/Downloads/buildbeat测试/init` | `buildbeat init` | 新项目 default layout；先 dry-run，后 `--yes` apply |
| `~/Downloads/buildbeat测试/adopt-tide` | `buildbeat adopt` | 从原始 `~/Downloads/tide` 只读复制出的隔离副本；compact layout |
| `~/Downloads/buildbeat测试/skill-only` | Skill-only | 从当前模板手动安装必需骨架；不生成 CLI manifest |

没有写入旧名目标 `~/Downloads/solobaton测试`、`~/Downloads/tide_副本` 或 `~/Downloads/solobaton-skill测试`。复核时，旧 init 的 `1`、`2` 仍为空，三个旧 apply 目标 HEAD 仍分别为 `eb27a88663701ea03de776e32b6a23c2d1e3ac28`、`5b6aa726a1722226f9651a14bf0fb8fa36a5f9f6`、`b63383db9e56f17495a8ccc8edcb81e7c9cf24f0`，均 clean、无 remote，与旧报告一致。

## 写入与 namespace 证据

两套 CLI dry-run 均返回 exit 0、`ready=true`、`writesPerformed=false`、零 blocker；apply 后再由 Skill 完成项目语义渲染。三目标扫描旧 namespace 的 `SOLOBATON.md`、`.solobaton/`、旧 managed marker 与 `Solobaton` 文本均为 0 命中。

| 检查 | default init | compact adopt | Skill-only |
|---|---|---|---|
| canonical marker | `BUILDBEAT.md` | `pm/BUILDBEAT.md` | `BUILDBEAT.md` |
| canonical manifest | `.buildbeat/manifest.json`，schema 2 | `.buildbeat/manifest.json`，schema 2 | 按入口边界缺失 |
| layout / namespace | `default` / `buildbeat` | `compact` / `buildbeat` | `default` / `buildbeat` |
| optional standards / ADR | 未生成 | 未生成 | 未生成 |
| 项目级占位符 | 0 | 0 | 0 |
| 旧 namespace 引用 | 0 | 0 | 0 |

Skill-only 共有 18 个 tracked 骨架文件，`gitignore.template` 已变为 `.gitignore`；没有伪造 `.buildbeat/manifest.json`，因此不宣称 CLI ownership、机械 upgrade 或 uninstall 能力。

## Tide protect-and-adopt

原始 `~/Downloads/tide` 仅作为只读复制源；复制时排除 `.git/`、`node_modules/` 与 `.DS_Store`。源与目标复制基线均为 76 个普通文件，聚合 SHA-256 均为：

`a1a23c1e1abbd23ff248a1f782c9b5e7c1ddefa251bef7ff1da617014894e827`

原 `.gitignore` 为 173 字节，SHA-256 为：

`31bd73f175152a312f56c77a0d9bcd61b597a9a4ac07c75a3d747f32aa19e91c`

adopt 与语义渲染完成后，以原始 76 个路径逐文件回查：除 `.gitignore` 只校验 managed fragment 之前的原始 173 字节前缀外，其余文件均做完整字节比较，结果 `MISMATCHES=0`。没有执行 build、修改扩展构建产物、加载 Chrome、访问发布渠道或部署。

## Git、Hook 与验证矩阵

本地候选提交用于固定可复核代码树；随后单独提交 NOW/看板/协议证据，避免候选自引用。三个仓库均为 `main`，最终 clean、无 remote，`.git/hooks/pre-commit` 与各自仓内规范脚本逐字节一致。

| 目标 | 基线 / candidate | review-ready evidence | Gate3 关闭 HEAD | commit 数 |
|---|---|---|---|---|
| default init | candidate `bb5cf55a2f099ce96f941473af3bd7d452fe1aad` | `f181e3e5759ac692eed96f055111f05d49f7dd3d` | `4ea29a94a3a29fa905ae99662359ec561298135d` | 3 |
| compact adopt | baseline `1159a4a5f702469c2fff4df01ddbdcc305e6d6af`；candidate `84261c935eb6cda724e9840888e02fcce51a1b84` | `9cfda12cc3225db2e75ccd5990bb7d1df7f0359b` | `69d6e8358f7fda03225c090d99b5647cae152183` | 4 |
| Skill-only | candidate `8ed14e83b43b8d960faad343d13b7aa8ea56dced` | `bd7fb59f9a99c4428377081cba25b294e30f685c` | `6b32c53e4fd750770690a0bbe796638314cb792a` | 3 |

| 检查 | default init | compact adopt | Skill-only |
|---|---|---|---|
| `doctor` | `ok=true`，0/0 | `ok=true`，0/0 | `ok=true`，0 error，预期 1 warning |
| `verify-status.sh --run` | coordination 全绿 | metadata 全绿 | coordination 全绿 |
| 离线 `bus-check --strict` | exit 0 | exit 0 | exit 0 |
| Hook 与仓内脚本 | 一致 | 一致 | 一致 |
| 最终工作区 / remote | clean / 无 | clean / 无 | clean / 无 |

离线 strict 仍明确保留三类 `unverified`：远端 fetch 被 `BUS_CHECK_NO_FETCH=1` 跳过、live-status 被 `BUS_CHECK_NO_LIVE=1` 跳过、生产 drift adapter 未配置。它只证明本地文件总线没有 conflict/error。

## 当前 Gate 与下一步

- default init 与 Skill-only：Gate1/Gate3 passed，Gate2/Gate4 因本地无 UI/部署而有明确 n/a 理由；WP2.8 已关闭。
- Tide adopt：namespace 候选 Gate3 passed，WP2.8 已关闭；Chrome 真机/UI 走查的 Gate2 与发布 Gate4 仍分别 pending，不被本次确认替代。
- 上游源仓：保持未提交 worktree；本报告写入后完整 `prepublishOnly` 已通过 Node `41/41`、Shell `176/176`、Skill-only、plugin `7/7`、99 份 Markdown 检查与 73 文件 pack dry-run，ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 也全部通过。这仍不会自动形成 source commit。
- 外部迁移：GitHub 仓库改名、scoped npm package、tag、Release、publish 与 registry 回读继续等待独立决策和授权。
