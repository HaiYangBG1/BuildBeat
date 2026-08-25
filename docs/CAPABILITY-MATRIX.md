# BuildBeat 能力矩阵 / Capability Matrix

> 状态：Phase 4 / WP4.3 scoped 分发迁移合同（2026-08-25）。本页同时区分 Skill-only、legacy npm v0 和 BuildBeat 1.20；源码、registry artifact 与真实项目证据仍分别核验。

## 1. 三组生命周期入口

WP4.2 所说的“CLI 三命令”按职责分成三组，不是把 `version` 或兼容别名算成新生命周期能力：

| 组 | canonical 命令 | 机械责任 | 不承担 |
|---|---|---|---|
| 检查 | `buildbeat doctor` | 只读识别安装/布局/版本、关键文件、占位符、Hook 与本地依赖降级 | 不复制 `bus-check`，不判断业务正确、Gate 或线上健康 |
| 建骨架 | `buildbeat init` / `buildbeat adopt` | 规划或受控写入默认/紧凑布局，填确定项，manifest 最后写 | 不猜项目语义，不安装 Hook，不初始化 Git，不跨人工 Gate |
| 机械升级 | `buildbeat upgrade` | 对真实 schema 2 基线按 policy/hash 替换未改文件，冲突时 fail-closed | 不三方合并，不覆盖 project-owned，不猜 legacy 所有权，不自动删文件 |

`buildbeat version` 是纯信息工具。`diff` 与 `uninstall` 仍只是返回 `command_not_available` 的保留名；`check/status/gate/adr/standards` 属于 Skill 与项目脚本，不进 CLI。`solobaton` 是 legacy 可执行兼容别名，不是第四组能力。

## 2. 可用面与权威边界

| 能力 | Skill-only / 手工路径 | legacy `solobaton@1.16.3` | BuildBeat `@haiyangbg/buildbeat@1.20.0` | 权威与边界 |
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
- **BuildBeat 1.20:** `@haiyangbg/buildbeat` is the canonical scoped distribution for bounded `init/adopt` writes and schema-2-only mechanical `upgrade`. Registry availability, provenance, and exact artifact identity must be read back independently.
- **Claude Code plugin:** the local marketplace candidate distributes the canonical Skill/templates/docs, not the top-level npm CLI `bin/`; installation evidence does not authorize project writes or npm publication.
- **Project runtime:** after scaffolding, the Git files and project-local scripts remain independently usable. BuildBeat has no account service, telemetry, remote project database, or agent runtime.

The real version-increment and multi-repository evidence is archived in [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md); release readiness is tracked separately in [`PHASE4-STABILITY-AUDIT-2026-08-25.md`](PHASE4-STABILITY-AUDIT-2026-08-25.md). Command details remain authoritative in [`CLI.md`](CLI.md); legacy migration uses [`LEGACY-V1.16-MIGRATION.md`](LEGACY-V1.16-MIGRATION.md).
