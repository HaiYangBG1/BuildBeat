# `V2-D2` 决策卡：M-1 分叉

> 日期：2026-08-28
> 状态：`V2-D2=A`（2026-08-28 项目所有者拍板，完整内核）
> 决策人：项目所有者
> 证据：[`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../pilot/evidence/2026-08-28-m1-runtime-gap.md) · [`pilot/metrics.md`](../pilot/metrics.md)

## 已确认事实

- `V2-D0=B` 已决定建设 v2；本卡只决定内核范围，不再讨论做不做。
- ChickAI、Tide、AI 底座三次真实工作都没有由 `pilot/loop.sh` 自动激活，自动 Run ledger 为 `0/3`；三者均只能作为真实流程/负向证据，不能伪装成合格自动 Run。
- F1～F4 的 fail-closed fixture 通过；F5 已确认只能阻断、不能恢复；F6 已确认没有持久化 Approval 对象，也不会自动产生 stale 事件。
- 当前暂定可组装能力加权覆盖率为 `45.8%（5.5/12）`，低于薄内核路线要求的 `80%`。
- 当前仍没有 v2 tag、`next` 预发布、远端发布或目标项目原地升级。

## A（推荐）：完整内核

关闭 M-1，选择 `V2-D2=A`，进入 M0。M0 先冻结产品定位、领域模型、Workflow/Policy 与 events v1；随后 M1 实现最小纵切：Run/Step 状态、events ledger、reducer、Workspace、Shell Adapter、Evidence Collector 和 `run start/status/stop`。F5/F6 分别在 M1/M2 关闭。

理由：重复出现的核心问题不是 Agent 不会做业务，而是工件不能自动触发、运行态靠人脑、进程不能恢复、审批没有对象。继续增加手工案例不会提高这四项能力。

本选择只授权在本地 `v2` 分支进入 M0/M1 实现与验证；不包含 push、merge、npm publish、tag、部署、生产动作或目标项目原地升级。

## B：继续 M-1

保持 `V2-D2=PENDING`，等待 AI 底座出现下一项自然、已授权、低风险的非生产开发任务，再要求它从干净 oracle 进入现有 `pilot/loop.sh`。不补造演示需求，不回放旧 candidate。

代价：脚本本身没有自动触发、恢复和 Approval 对象；在新增这些能力前，第四次任务仍可能被人工流程绕过，且即使成功也无法消除已确认的 F5/F6 缺口。

## 回复方式

- `A`：完整内核，进入 M0/M1。
- `B`：继续等待下一项真实任务，M-1 保持开放。

## 拍板结果（2026-08-28）

项目所有者选择 **A**。主判据为重复出现的 CRITICAL 运行缺口（自动激活 `0/3`、F5 恢复缺失、F6 Approval 对象缺失）；「已确认事实」中的暂定覆盖率 45.8% 混合了 fixture 与人工候选证据，按 [`pilot/metrics.md`](../pilot/metrics.md) 的口径仅作旁证，不作为分叉依据。M-1 关闭，进入 M0；台账见 [`V2-DECISIONS.md`](V2-DECISIONS.md)。
