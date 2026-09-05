# M1 验收证据：真实项目 build → verify 由 Shell Adapter 驱动

> 日期：2026-08-28
> 验收对象：[`V2-PLAN.md`](../V2-PLAN.md) §8 M1——"真实项目上 `build → verify` 两步由 Shell Adapter 驱动跑通，证据全部来自回读"
> 真实项目：BuildBeat 仓库自身（self-host）；run 由 [`src/v2/cli/run.js`](../../src/v2/cli/run.js) 前台驱动

## 运行事实（全部来自 ledger 与 Runner 回读，非人工声明）

| 项 | 值 |
|---|---|
| Work / Run | `WORK-V2-M1-ACCEPT` / `RUN-M1-ACCEPT-01` |
| workflow | `software-delivery @ sha256:dee44ff7…`（运行时 pin 的文件 digest） |
| base → candidate | `74e7882` → `30b3a0d`（candidate 是隔离 worktree 中 builder 脚本 agent 的真实 commit，经 `git rev-parse` 回读固定） |
| build | SUCCEEDED（attempt 1；`git commit` 退出码 0 回读） |
| verify | SUCCEEDED（attempt 1；worktree 内真实执行 `node --test tests/v2-event-ledger.test.js tests/v2-reducer.test.js tests/v2-workflow.test.js`，**20/20 通过、退出码 0**，由 Runner 回读并落日志 digest） |
| 停点 | `WAITING_HUMAN`，transition `enter-review`（stopAt 自动化边界；不自动 merge） |
| 收尾 | `run stop` → `RUN_TERMINAL CANCELLED`（candidate 保留在 `run/RUN-M1-ACCEPT-01` 分支，不合并）→ 终态压实 |
| 压实记录 | [`delivery/work/WORK-V2-M1-ACCEPT/runs/RUN-M1-ACCEPT-01/run-record.json`](../../delivery/work/WORK-V2-M1-ACCEPT/runs/RUN-M1-ACCEPT-01/run-record.json)：事件区间 1–20、末事件 digest `sha256:6eddad5e…`、attempts/budgets、终止原因 |

## 与 M-1 缺口的对应

- **卡点 1/5（无 Run 登记、无统一 ledger）**：本 run 从 `RUN_CREATED` 到 `RUN_COMPACTED` 共 20 个事件全部在哈希链 ledger 中，attempts/预算有台账；没有 Run 登记的工作在 v2 中无法产生任何状态。
- **F5（中断恢复）**：`resumeRun` 已实现并有 4 项专项测试——在途 step 一律按 crashed 收口、恢复点取最近 CHECKPOINT 或记录的 entry、dirty 现场升级给人、workflow digest 变化拒绝恢复；不再依赖人脑记忆。
- **证据回读**：两步证据均为 Runner 写入的命令日志 + sha256 digest；Worker 的自然语言输出在任何地方都不构成通过依据。

## 边界（诚实声明）

- builder 是脚本化 CLI agent（真实命令、真实 git、真实退出码）；接真实 AI agent CLI 只是 Shell Adapter 的配置替换，专用 Adapter 按计划 M3 末再选（裁决 #5）。
- review 步、Approval/stale 运行时闭环、预算 Policy 化属于 M2 范围；F6 的运行时验收在 M2 关闭（事件与合同已在 M1 就绪并有 reducer 级测试）。
- 本验收不含 merge/push/发布；candidate 只存在于 run 分支。

## 复核命令

```text
node src/v2/cli/run.js status --repo . --run RUN-M1-ACCEPT-01
git show --stat run/RUN-M1-ACCEPT-01
npm test        # 全量套件（含 v2 的 28 项测试）
```
