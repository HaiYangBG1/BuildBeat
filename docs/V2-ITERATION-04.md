# v2 迭代 04：M2 自动修复环

> 状态：**已完成——M2 于 2026-08-28 核验 18/20 通过**（2 项 `PARTIAL` 挂 M3；核验表：[`v2/M2-DOD-2026-08-28.md`](v2/M2-DOD-2026-08-28.md)）
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8 M2；M1 验收：[`v2/M1-ACCEPTANCE-2026-08-28.md`](v2/M1-ACCEPTANCE-2026-08-28.md)
> 时间盒：**≤3 周**；授权边界沿用 `V2-D2=A`（仅本地 `v2` 分支，不含 push/merge/发布/部署/生产）

## 迭代目标

MVP 核心承诺在此达成：**给 BuildBeat 一个已批准的目标和计划，它会自动完成 Build–Verify–Fix–Review 循环，并携带完整证据停在合并决定前。** 验收 = 报告 B §20 的 20 条 MVP DoD 逐条通过。

## 任务清单

- [x] **T1 Worker 输出信封 v0**：adapter 经 `BUILDBEAT_OUTPUT` 提供信封文件路径；Worker 写 JSON（status/findings）；信封非法即 `invalid-output`，fail-closed（`v2-review-loop` 第 3 例）。
- [x] **T2 Review 闭环**：review 步消费信封 findings；P0/P1 → `findings-blocking` 边回 Fix（POLICY 结果 ROUTE）；Reviewer **只读强制**（步前后 workspace 回读比对，写入即 BLOCK 停人）；findings 落 Evidence（kind review）。测试 `tests/v2-review-loop.test.js`。
- [x] **T3 决策运行时**：`src/v2/runtime/decisions.js` + CLI `inbox`/`approve`/`reject`——approve 前重验 subject 新鲜度（candidate 变了就刷新请求而不是盖章）；决策同时落 `DECISION_RECORDED` 事件与 `delivery/work/<id>/decisions.jsonl`；final-decision 批准 → `RUN_TERMINAL SUCCEEDED` + 压实（merge 本身仍是人工外部动作）。测试 `tests/v2-approval.test.js`。
- [x] **T4 F6 运行时关闭**：批准后 candidate/plan 变化 → resume 时机器检出 → `APPROVAL_STALE` → 回 `WAITING_HUMAN`；stale 请求的重批先刷新 subject 再绑定新对象；批准后干净恢复则跳过已批边界继续驱动（`v2-approval` 第 1/2 例）。
- [x] **T5 Intent/Plan 读取**：run 启动读取 work 目录 intent/plan 并 pin digest 进 RUN_CREATED 与 Approval subject（`v2-mvp-loop` 断言 planDigest 贯穿到 final-decision subject）。
- [x] **T6 预埋 Bug 自动修复端到端**：真实测试项目 fixture——builder 提交带 bug 候选 → verify 真实红 → fixer 修复 → verify 绿 → review 只读通过 → 停在合并前 → approve 终态 + 压实 + ledger 重放一致（`tests/v2-mvp-loop.test.js`）。
- [x] **T7 MVP DoD 20 条逐条核验**：[`v2/M2-DOD-2026-08-28.md`](v2/M2-DOD-2026-08-28.md)——18/20 通过；#1（plan 的"被接受"强制）与 #20（coverage 纪律）标 `PARTIAL` 挂 M3，属 M3 Policy Engine 既定范围。

## 实现口径

- workflow step 新增 `readonly` 字段（schema additive 演进；正式 JSON Schema 文件仍按 WP1.1 后补）；官方预设 review 步 `readonly: true`。
- `HUMAN_REQUESTED` data 新增 `kind`（`boundary` / `final-decision`；additive）；`RUN_CREATED` data 新增 `planDigest` / `intentDigest`（additive）。SPEC-0001 信封与既有必填集不变。
- 继续零运行时依赖 + `node --test`。

## 完成定义

T7 的 DoD 核验表全绿（或逐条标注去向）并留证据；`V2-PLAN.md` §8 M2 标记完成后进入 M3（治理硬化）。**已于 2026-08-28 达成**：18/20 ✓，#1/#20 `PARTIAL` 且去向明确（M3 Policy Engine）；MVP 核心承诺由 `tests/v2-mvp-loop.test.js` 端到端复现。进入 M3。
