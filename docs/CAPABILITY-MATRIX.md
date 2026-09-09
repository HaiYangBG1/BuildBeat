# BuildBeat 能力矩阵 / Capability Matrix

> 状态：BuildBeat `@haiyangbg/buildbeat`（dist-tag `latest`；发布证据按版本归档在本目录的 `*-RELEASE-EVIDENCE-*.md`）。本页按**产品层次**区分三个可用面：Skill-only 手工路径、运行时 `buildbeat`、Claude Code 插件。源码、registry artifact 与真实项目证据仍分别核验。

## 0. 三个可用面

| 层 | 是什么 | 装在哪 | 权威文档 | 已验证到什么程度 |
|---|---|---|---|---|
| **Skill-only 手工路径** | 工件协议（Work 目录、intent/plan、决策台账、证据分级）由 AI 会话按 `SKILL.md` 手工维护 | Skill 本身（仓库 `SKILL.md` / 插件） | `SKILL.md` | 协议完整可用；**没有**自动闭环、隔离 worktree、digest 绑定批准校验、预算与恢复 |
| **运行时 `buildbeat`** | 隔离 worktree 内 Build→Verify→Review→Fix 自动闭环，停在人的合并决定；`accept / start / resume / status / inbox / overview / approve / reject / findings / doctor / preflight / gc / metrics / observe / watch` | `npm install --global @haiyangbg/buildbeat@latest` | [`v2/guide/`](v2/guide/README.md)、RFC-0001/2/3、SPEC-0001 | 单元与 CLI 端到端测试（`tests/v2-*.test.js`，含脚本 worker 的模板首跑）与打包首跑（`tests/pack-firstrun.test.sh`）；真实 AI worker 试点见 `docs/v2/M4-*`、迭代记录（`codex exec` 实证；其他工具"可通过命令接入"，未逐一验证） |
| **Claude Code 插件** | 把 Skill、模板、文档、lessons 装进 Claude Code；**不含**任何 CLI `bin/` | `claude plugin marketplace add HaiYangBG1/BuildBeat` + `claude plugin install buildbeat@buildbeat-plugins` | [`plugins/buildbeat/README.md`](../plugins/buildbeat/README.md) | `tests/plugin-marketplace.test.sh`（manifest 校验、隔离安装、缓存自包含）；装了插件不等于装了运行时，两者分别检查 |

一句话：Skill 是入口（会话读它决定调什么），`buildbeat` 是引擎（跑 Run、回读事实），项目文件是事实（Git 面 `delivery/` 与本机 `.buildbeat/`），插件只是把入口送进 Claude Code。

## 1. 运行时面：`buildbeat`

| 能力 | Skill-only / 手工路径 | 运行时 `buildbeat` | 权威与边界 |
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
| 首跑验证 | — | `tests/v2-templates-firstrun.test.js`：脚本 worker 从模板走到合并决定（含 verify 失败→fixer）；`tests/pack-firstrun.test.sh` 从安装后的包再走一遍 | 证明路径与合同连得上，不证明真实模型能完成任务 |

## 2. Distribution status / 分发状态

- **Skill-only:** first-class and complete for protocol semantics; it does not need the runtime.
- **Runtime:** `@haiyangbg/buildbeat@latest` ships one executable, `buildbeat`, with zero third-party runtime dependencies. Each published version is independently read back (registry identity, provenance, signatures, isolated install, packaged first run) before the tag moves; the dated evidence files in this directory are the record, [`RELEASING.md`](RELEASING.md) is the procedure.
- **Claude Code plugin:** the local marketplace candidate distributes the canonical Skill/templates/docs, not the top-level npm CLI `bin/`; installation evidence does not authorize project writes or npm publication.
- **Project runtime:** the Git files remain independently usable without the runtime. BuildBeat has no account service, telemetry, remote project database, or hosted agents; the runtime is a local process that orchestrates the commands you configure and never carries a model of its own.

The command surface is documented in [`v2/guide/`](v2/guide/README.md) with RFC-0003 as the workflow authority. Removed generations (the file bus, its lifecycle CLI, and the pre-3.0 executable names) live only in the dated history under this directory and in [`CHANGELOG-v1.md`](../CHANGELOG-v1.md).
