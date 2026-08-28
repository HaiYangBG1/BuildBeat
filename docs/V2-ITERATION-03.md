# v2 迭代 03：M1 最小纵切

> 状态：**已完成——M1 验收于 2026-08-28 通过**（证据：[`v2/M1-ACCEPTANCE-2026-08-28.md`](v2/M1-ACCEPTANCE-2026-08-28.md)）
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8 M1；RFC/SPEC 定稿：`V2-D3`（[`V2-DECISIONS.md`](V2-DECISIONS.md)）
> 时间盒：**≤3 周**；授权边界沿用 `V2-D2=A`（仅本地 `v2` 分支，不含 push/merge/发布/部署/生产）

## 迭代目标

不追求内核完备，追求一条真实可跑的纵线。**验收**：真实项目上 `build → verify` 两步由 Shell Adapter 驱动跑通，证据全部来自回读。**止损**：纵切显示单人维护成本过高 → 降级为"单步推进 + 审批收件箱"半自动形态，M2 以后重排。

## 实现口径

- **语言**：内核使用仓库现有约定——零运行时依赖的 Node ESM JavaScript + `node --test`，不引入 TypeScript 构建链。这是对报告 B §23.1（建议 TS）的**已声明偏离**：理由是 v1 全仓零依赖、`prepublishOnly` 直接跑源文件，引入编译步骤改变打包与测试形态，收益不抵成本；若 M2 出现类型复杂度失控，可低成本改判（届时回写台账）。
- **目录**：`src/v2/{domain,engine,storage,workspace,adapters,evidence,cli}`，模块边界照报告 B §23.2；`adapters/` 不得直接改内核状态。
- **合同来源**：事件一切以 [`v2/SPEC-0001-events-v1.md`](v2/SPEC-0001-events-v1.md)（FROZEN）为准；实现与规格冲突先改实现。

## 任务清单

- [x] **T1 Event Ledger（WP1.2）**：`src/v2/storage/event-ledger.js`——append-only JSONL、单调 seq、digest/prev 哈希链、原子追加、损坏检测与截断报告、写侧合法性校验；测试 `tests/v2-event-ledger.test.js`（8 例：链校验、重放一致、篡改/删行截断、未知版本拒绝、未知类型保留跳过、写侧拒绝）。
- [x] **T2 State Reducer（WP1.3）**：`src/v2/engine/reducer.js` + `src/v2/domain/`——由事件派生 Run/Step 状态、attempts、budgets、candidate、待批请求、evidence；replay 确定性；非法序列报告而非修补；测试 `tests/v2-reducer.test.js`（7 例：全流程、确定性、失败指纹连击、approval stale 往返、非法序列、checkpoint/interrupt）。
- [x] **T3 最小 Workflow parser**：`src/v2/engine/workflow.js` + 严格 YAML 子集 `src/v2/engine/yaml-subset.js`（fail-closed：tab/锚点/flow/多行标量/重复键全部拒绝）；官方预设 `src/v2/presets/software-delivery.yaml`；环检测 + 未知字段拒绝。
- [x] **T4 Workspace Manager**：`src/v2/workspace/workspace-manager.js`——worktree 隔离、mkdir 原子锁、candidate 仅由 git 回读、dirty 拒绝；run 分支保留使 candidate 始终可达。
- [x] **T5 Mock + Shell Adapter**：`src/v2/adapters/`——Mock 覆盖 succeed/fail/timeout/crash/invalid-output；Shell 配置化驱动任意 CLI；Adapter 不得触碰内核状态。
- [x] **T6 Evidence Collector v0**：`src/v2/evidence/collector.js`——命令/退出码/日志 digest 回读，落 Evidence Contract（默认 L2）。
- [x] **T7 `run start/resume/status/stop`**：`src/v2/cli/run.js` + `src/v2/runtime/orchestrator.js`（单 Project 单 Run 前台；终态压实 run-record）。**resume 即 F5 纵切**：在途 step 按 crashed 收口、恢复点取最近 CHECKPOINT/记录 entry、dirty 升级给人、workflow digest 变化拒绝恢复。
- [x] **T8 M1 验收（2026-08-28 通过）**：BuildBeat 仓库自身 self-host——Shell Adapter 驱动 build（真实 commit candidate `30b3a0d`）→ verify（真实 `node --test` 20/20 回读），停在 `WAITING_HUMAN`，终态压实。证据：[`v2/M1-ACCEPTANCE-2026-08-28.md`](v2/M1-ACCEPTANCE-2026-08-28.md)。

## 完成定义

T8 验收通过并留证据（run ledger + run-record 压实样例）；`V2-PLAN.md` §8 M1 标记完成后进入 M2（自动修复环）。**已于 2026-08-28 达成**：验收证据 [`v2/M1-ACCEPTANCE-2026-08-28.md`](v2/M1-ACCEPTANCE-2026-08-28.md)，压实样例 `delivery/work/WORK-V2-M1-ACCEPT/runs/RUN-M1-ACCEPT-01/run-record.json`；进入 M2。
