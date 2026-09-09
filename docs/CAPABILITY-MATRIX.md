# BuildBeat 能力矩阵 / Capability Matrix

> 状态：BuildBeat `@haiyangbg/buildbeat@2.0.2`（dist-tag `latest`，2026-09-09；2.0.0 于 2026-09-05 首次把 v2 发到 `latest`）。本页按**产品层次**区分四个可用面：Skill-only 手工路径、v1 生命周期 CLI（`buildbeat`）、v2 运行时（`buildbeat-v2`）、Claude Code 插件；并保留 v1.21 分发合同的原始条目与 legacy npm v0 的边界。源码、registry artifact 与真实项目证据仍分别核验。

## 0. 四个可用面

| 层 | 是什么 | 装在哪 | 权威文档 | 已验证到什么程度 |
|---|---|---|---|---|
| **Skill-only 手工路径** | 工件协议（Work 目录、intent/plan、决策台账、证据分级）由 AI 会话按 `SKILL.md` 手工维护 | Skill 本身（仓库 `SKILL.md` / 插件） | `SKILL.md` | 协议完整可用；**没有**自动闭环、隔离 worktree、digest 绑定批准校验、预算与恢复（`tests/skill-only.test.sh` 证明去掉 CLI 后 v1 文件总线仍可维护） |
| **v1 生命周期 CLI `buildbeat`** | `doctor / init / adopt / upgrade / version`：v1 文件总线骨架的只读体检、受控写入与 schema 2 机械升级 | `@haiyangbg/buildbeat@latest`（2.0.0 起与 v2 同包；骨架版本仍 v1.21） | [`CLI.md`](CLI.md) | 1.21 发布证据 + 真实版本增量试点（§5）；2.0.0 未改其命令与边界 |
| **v2 运行时 `buildbeat-v2`** | 隔离 worktree 内 Build→Verify→Review→Fix 自动闭环，停在人的合并决定；`accept / start / resume / status / inbox / overview / approve / reject / findings / doctor / preflight / gc / metrics / observe / watch` | 同上 | [`v2/guide/`](v2/guide/README.md)、RFC-0001/2/3、SPEC-0001 | 单元与 CLI 端到端测试（`tests/v2-*.test.js`，含脚本 worker 的模板首跑）；真实 AI worker 试点见 `docs/v2/M4-*`、迭代记录（`codex exec` 实证；其他工具"可通过命令接入"，未逐一验证） |
| **Claude Code 插件** | 把 Skill、模板、文档、lessons 装进 Claude Code；**不含**任何 CLI `bin/` | `claude plugin marketplace add HaiYangBG1/BuildBeat` + `claude plugin install buildbeat@buildbeat-plugins` | [`plugins/buildbeat/README.md`](../plugins/buildbeat/README.md) | `tests/plugin-marketplace.test.sh`（manifest 校验、隔离安装、缓存自包含）；装了插件不等于装了运行时，两者分别检查 |

一句话：Skill 是入口（会话读它决定调什么），CLI 是引擎（`buildbeat-v2` 跑 Run、`buildbeat` 管 v1 骨架），项目文件是事实（Git 面 `delivery/` 与 `.buildbeat/`），插件只是把入口送进 Claude Code。

## 1. 三组生命周期入口

WP4.2 所说的“CLI 三命令”按职责分成三组，不是把 `version` 或兼容别名算成新生命周期能力：

| 组 | canonical 命令 | 机械责任 | 不承担 |
|---|---|---|---|
| 检查 | `buildbeat doctor` | 只读识别安装/布局/版本、关键文件、占位符、Hook 与本地依赖降级 | 不复制 `bus-check`，不判断业务正确、Gate 或线上健康 |
| 建骨架 | `buildbeat init` / `buildbeat adopt` | 规划或受控写入默认/紧凑布局，填确定项，manifest 最后写 | 不猜项目语义，不安装 Hook，不初始化 Git，不跨人工 Gate |
| 机械升级 | `buildbeat upgrade` | 对真实 schema 2 基线按 policy/hash 替换未改文件，冲突时 fail-closed | 不三方合并，不覆盖 project-owned，不猜 legacy 所有权，不自动删文件 |

`buildbeat version` 是纯信息工具。`diff` 与 `uninstall` 仍只是返回 `command_not_available` 的保留名；`check/status/gate/adr/standards` 属于 Skill 与项目脚本，不进 CLI。`solobaton` 是 legacy 可执行兼容别名，不是第四组能力。

## 2. v1 生命周期面：Skill-only / legacy v0 / `buildbeat`

本节是 v1.21 分发合同的原始条目，2.0.0 未改变其中任何一行；v2 运行时的能力见 §2.5。

| 能力 | Skill-only / 手工路径 | legacy `solobaton@1.16.3` | v1 生命周期 CLI（BuildBeat `@haiyangbg/buildbeat@1.21.0` 起，2.0.0 包内不变） | 权威与边界 |
|---|---|---|---|---|
| 理解新/存量项目，只问剩余问题 | 完整；读代码/配置后做 Bootstrap/Adopt | 不提供语义判断 | 不提供语义判断，只输出有界事实/问题 | Skill 与当前 AI 会话承担语义，CLI 不内置模型 |
| 安装与能力体检 | 读文件并运行项目脚本 | `doctor` 只读可用 | `doctor` 只读可用 | `doctor` 是 CLI 体检；同步检查唯一权威仍是项目 `bus-check` |
| 新项目 Bootstrap | 一屏确认后手动复制/渲染，完整可用 | `init --dry-run` 只规划；去掉 dry-run 拒绝写入 | `init --dry-run` 预览；无 blocker + 确认后受控 apply | 项目事实与剩余占位符必须回到 Skill 渲染 |
| 存量项目 Adopt | 先摸底/划新旧边界/补最小验证，完整可用 | `adopt --dry-run` 只规划 | `adopt --dry-run` 预览；默认紧凑布局，确认后受控 apply | CLI 不决定绞杀者边界、危险区或 L3 充分性 |
| 项目语义渲染 | 完整；填契约、看板、验证、部署与风险事实 | 不提供 | 只填项目名/日期/版本/布局等确定项 | CLI 的 `pendingPlaceholders` 是交接清单，不是完成声明 |
| Gate、status、evidence、standards、ADR | 完整；由 Skill + 项目文件/脚本维护 | 不提供工作流命令 | 不提供工作流命令 | 人工 Gate 不能被 CLI/reviewer/绿测试代批 |
| 同步/Gate/证据/多仓/STACK 检查 | 项目内 `bus-check --format=json --strict` 可独立运行 | 不复制脚本 finding | 不复制脚本 finding | `docs/CHECKS.md` + 项目脚本是唯一同步检查权威；覆盖不完必须显示 unverified |
| schema 2 生命周期基线 | Skill-only 不需 manifest，也不手写伪造 | 只读识别历史 manifest | `init/adopt` 成功交易最后写入 | manifest 只是所有权/hash 基线，不是项目事实数据库 |
| 拷出/legacy 项目升级 | 按 CHANGELOG 和 policy 手工语义合并 | `upgrade` 未开放 | 无真实 schema 2 基线必须 blocked | 不手写/复制/改名 manifest；见 `LEGACY-V1.16-MIGRATION.md` |
| schema 2 机械升级 | Skill 处理机械冲突后的语义合并 | 未开放 | 已实现；同 major 按 hash，跨 major 需 `--major`，`--force` 不碰 project-owned | 真实版本增量试点与发布证据分别归档，不以模板测试代替 |
| Git 初始化、Hook、commit/push/deploy/publish | 经明确授权后人/会话按项目边界执行 | 不执行 | 不执行 | 生命周期 CLI 不扩张任何外部权限；发布另走 `RELEASING.md` |

## 2.5 v2 运行时面：`buildbeat-v2`（2.0.0）

| 能力 | Skill-only / 手工路径 | v2 运行时 `buildbeat-v2` | 权威与边界 |
|---|---|---|---|
| 工件接受 | 会话记一行到 `decisions.jsonl` | `accept --artifact intent\|plan\|spec`：digest 绑定；改过即 `stale`，`doctor` / `overview` 报出 | 接受不是开工；policy 按 riskPreset 决定 build 前要求哪些工件已接受 |
| 自动闭环 | 无 | `start --config <run-config> [--attempt new]`：隔离 worktree、builder→verify→review→fix 自动路由、停 `WAITING_HUMAN` | 一仓同时只有一个活动 Run；worker 是配置的任意命令，内核不内置模型 |
| 进度与等待 | 会话读目录 | `overview`（每 Work 阶段 / 下一步 / 成本）、`inbox`（等人的 Run + 下一句命令）、`status`（步、耗时、STALLED、证据、findings）、`metrics` | 全部只读；本机绝对路径不进输出 |
| 人批 | 会话记一行 | `approve --transition <t>` / `reject`：绑定 transition + candidate + planDigest + evidenceDigest，盖章前重读实况；非终态转换后 `resume` | 合并决定 = 候选具备合并条件；合并 / push / 部署无调用路径（不变量 20） |
| 发现分诊与锚定 | 无 | `reviewTriage: required` + `findings list / adjudicate`；reviewer 输入带历史裁决 `anchor` | dismiss 后同指纹不阻断；严重度升级 = 新指纹 |
| 预算与成本 | 无 | 每步 `maxAttempts`、Work 级 `reviewRoundsPerWork`、`BUDGET_EXTENDED` 续批、`overview` 的 `cost:` 行 | 预算耗尽是停人不是失败 |
| 故障与恢复 | 无 | timeout / crash / invalid-output / exit 75 判 `infra` 停人不扣预算；`resume`（含 `--adopt <sha>`）；`replay` 校验台账；`gc` 清工作树 | 重启后可能重跑未落账的步；台账人工改过不保证可重建 |
| 上线回读 | 手工记录 | `release-readback` 预设 + `riskPreset: release`：preflight 回读 → 人做 → apply 回读 → observe → 关窗 | 生产动作永远在 Runner 之外 |
| 生产体检 | 无 | `observe run / status / triage`：探针 → 分层 → Intent 草稿入队 | 草稿绝不自动执行 |
| 通知 | 无 | `.buildbeat/notify.yaml`（钉钉 / webhook，URL 只能来自环境变量） | 通知不是审批通道 |
| 环境合同 | 无 | `requires:`（command / probe）启动前 fail-closed；worker env 白名单，`env:` 点名注入，`inheritEnv` 显式打开 | 见 [安全边界](v2/guide/09-security-boundaries.md)：内核检测与移除的边界 vs 宿主沙箱 |
| 首跑验证 | — | `tests/v2-templates-firstrun.test.js`：脚本 worker 从模板走到合并决定（含 verify 失败→fixer） | 证明路径与合同连得上，不证明真实模型能完成任务 |

## 3. 双向互操作结论

| 转换 | 结论 | 已验证 | 不可外推 |
|---|---|---|---|
| Skill-only → CLI `doctor` | 可保守识别；无 manifest 显式 `manifest.missing`，不猜所有权 | `tests/skill-only.test.sh` 自动回归 | 不因 doctor 可读就获得机械 upgrade |
| CLI `init/adopt` → Skill-only | 项目仍是普通 Git 文件/脚本；屏蔽 Node/CLI 后可继续维护并 strict 检查 | 自动互操作回归 + WP2.8 本地真实目录试点 | 不证明业务测试、Gate 或线上状态 |
| CLI `upgrade` → Skill-only | 升级后仍使用同一文件协议；冲突交给 Skill 语义合并 | disposable 升级沙箱 + BuildBeat 1.20 真实版本增量试点 | 不证明未观测的业务、线上或生产状态 |
| legacy v1.16 → schema 2 | 默认继续手工维护；经批准才在专用分支重建基线 | 指南和静态契约已闭合 | 没有执行真实 legacy 迁移 |

## 4. Distribution status / 分发状态

- **Skill-only:** first-class and complete for protocol semantics; it does not need a lifecycle manifest or a runtime CLI.
- **Legacy npm v0:** `solobaton@latest` is frozen on `doctor`, `init/adopt --dry-run`, and version inspection, then deprecated toward the scoped package. Project writes and `upgrade` remain unavailable there.
- **BuildBeat 2.0.x (current `latest` = 2.0.2):** since `@haiyangbg/buildbeat@2.0.0` (evidence: [`V2.0.0-RELEASE-EVIDENCE-2026-09-05.md`](V2.0.0-RELEASE-EVIDENCE-2026-09-05.md)) one package ships the unchanged v1 lifecycle CLI `buildbeat` and the v2 runtime `buildbeat-v2`; 2.0.1 fixed run-config `env:` passthrough and added `templates/v2/` (evidence: [`V2.0.1-RELEASE-EVIDENCE-2026-09-06.md`](V2.0.1-RELEASE-EVIDENCE-2026-09-06.md)); 2.0.2 only trims historical documents from the tarball. The managed v1 scaffold stays at `v1.21`.
- **BuildBeat 1.21 (previous stable, 2026-08-25 → 2026-09-05):** `@haiyangbg/buildbeat@1.21.0` was the independently verified canonical scoped distribution before 2.0.0. It keeps the bounded `init/adopt` and schema-2-only mechanical `upgrade` surface established in 1.20, and adds the standard domain-response contract to Skill/scaffold handoffs. Registry availability, provenance, signatures, and exact artifact identity are archived in [`V1.21-RELEASE-EVIDENCE-2026-08-25.md`](V1.21-RELEASE-EVIDENCE-2026-08-25.md) and remain live-recheck requirements for future releases.
- **Claude Code plugin:** the local marketplace candidate distributes the canonical Skill/templates/docs, not the top-level npm CLI `bin/`; installation evidence does not authorize project writes or npm publication.
- **Project runtime:** after scaffolding, the Git files and project-local scripts remain independently usable. BuildBeat has no account service, telemetry, remote project database, or hosted agents; the v2 runtime is a local process that orchestrates the commands you configure and never carries a model of its own.

The real version-increment and multi-repository evidence remains archived in [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md); release readiness is tracked in [`PHASE4-STABILITY-AUDIT-2026-08-25.md`](PHASE4-STABILITY-AUDIT-2026-08-25.md), the first scoped publication in [`WP4.3-RELEASE-EVIDENCE-2026-08-25.md`](WP4.3-RELEASE-EVIDENCE-2026-08-25.md), and the current v1.21 distribution in [`V1.21-RELEASE-EVIDENCE-2026-08-25.md`](V1.21-RELEASE-EVIDENCE-2026-08-25.md). v1 lifecycle command details remain authoritative in [`CLI.md`](CLI.md); the v2 command surface is documented in [`v2/guide/`](v2/guide/README.md) with RFC-0003 as the workflow authority; legacy migration uses [`LEGACY-V1.16-MIGRATION.md`](LEGACY-V1.16-MIGRATION.md); moving a v1 file-bus project onto v2 uses [`v2/guide/08-migration-v1.md`](v2/guide/08-migration-v1.md).
