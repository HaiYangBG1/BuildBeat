# v2 迭代 01：M-1 人肉内核试点

> 状态：**执行中**——ChickAI 与 Tide 两个本地候选均已完成，但本次由当前会话人工编排，未由 `pilot/loop.sh` 驱动；因此只记候选交付与部分能力证据，尚不能形成 `V2-D2`
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8；决策台账：[`V2-DECISIONS.md`](V2-DECISIONS.md)；试点套件：[`pilot/`](../pilot/README.md)
> 时间盒：**≤2 周**（自 `V2-D1` 起算）；到期未跑完也必须按已有证据形成分叉结论或明确 `UNVERIFIED`

## 迭代目标（唯一交付）

依据三轮真实任务与六个故障注入场景，形成 `V2-D2`：

- **(a) 完整内核**：关键运行能力存在重复、无法由薄控制面修补的结构性缺口，总窗口约 12–15 周；
- **(b) 薄内核**：可组装能力覆盖充分，BuildBeat 只自研 approval staleness、统一证据台账、policy/gate 检查器，总窗口约 5–8 周。

v2 已由 `V2-D0=B` 决定正式实施；M-1 不再拥有“放弃 v2”的隐含第三选项。

## 任务清单

- [x] **T1（项目所有者，`V2-D1`）**：已点名两个低风险真实工作项：ChickAI 额度耗尽仍可登录（含 UI）与 Tide 悬浮球空闲收纳（小功能）；第三项暂留空。
- [x] **T2（两个当前项目）**：均已准备独立 `ACCEPT_CMD`，在原基线先失败、实现后通过；验收 oracle 已写入并提交到 `protected-paths.txt`。
- [x] **T3（两个当前项目）**：均使用 `pilot/*` 专用 branch/worktree，intent、plan、protected paths 与验收 oracle 先独立提交；候选与证据另行提交。
- [ ] **T4（每轮）**：当前两项没有运行 [`pilot/loop.sh`](../pilot/loop.sh)，attempts/token/费用也没有统一 ledger；人工阶段数不得冒充自动 Loop 数据。下一轮必须由脚本从干净 oracle commit 开跑。
- [ ] **T5（每轮）**：ChickAI 已做独立只读审查并收敛到 P0/P1/P2=`0/0/0`，Tide 仅完成回归/验收与视觉检查；两项均未由脚本产生 `WAITING_HUMAN` 终态，故本项未完成。
- [ ] **T6（故障注入）**：`npm run test:pilot` 的 fixture 已覆盖 F1–F4（11/11），真实试点的 F5/F6 仍为 `UNVERIFIED`。
- [ ] **T7（三轮或时间盒到期）**：按预置算法形成 `V2-D2`，回写 [`V2-PLAN.md`](V2-PLAN.md) §8 与 [`V2-DECISIONS.md`](V2-DECISIONS.md)。

## 2026-08-27 当前证据

- **ChickAI（含 UI）**：`pilot/quota-login-separation`，实现 `f78f64c`，证据 `d31c056`；全量 unit 157/157、冻结 unit 1/1、额度 UI5 3/3、typecheck/lint/build 通过，独立 reviewer P0/P1/P2=`0/0/0`。证据目录：`pilot-work/quota-login-separation/evidence/`。
- **Tide（小功能）**：`pilot/tide-idle-ball`，实现 `723289c`，证据 `4217708`；Node 测试 3/3、Rollup build、syntax/diff check 通过。证据目录：`pilot-work/tide-idle-ball/evidence/`。
- **共同边界**：两项均未 merge、push、发布或部署；ChickAI 生产仍为 0.17.83，Tide 未更新 `tide.zip`。两个候选完成不等于两轮自动 Loop 通过。

## 分叉判据

- **结论 (b) 薄内核**：可组装能力加权覆盖率 ≥80%，三轮平均计划外介入 ≤2，且没有在两轮以上重复出现、无法由三项薄内核能力修补的 CRITICAL 缺口。
- **结论 (a) 完整内核**：覆盖率 <80%，或至少两个 CRITICAL 运行缺口在两轮以上重复出现，或中断恢复/多步状态必须持续依赖人脑记忆。
- **中间态**：默认取 (b)，将存疑能力挂到 M4 复验；任何未跑场景必须标 `UNVERIFIED`，不得按通过计分。

指标与计算表见 [`pilot/metrics.md`](../pilot/metrics.md)。approval staleness、统一证据台账、policy/gate 检查器是已确定的薄内核自研面，不拿它们人为压低“可组装能力覆盖率”。

## 边界

- 不 merge、不 push、不部署、不发布；本迭代不授权任何生产操作。
- 提示词禁令只算 `ADVISORY`；必须移除 agent 的生产/发布凭据，并尽量使用宿主权限与网络限制。做不到就登记缺口，不得宣称已机器强制。
- 只选低风险工作项；v1 维护线不因试点而改变运行行为。
- 零新增运行时依赖；试点 evidence 留在专用工作目录，清理 branch/worktree 前先保留。

## 完成定义

三轮数据或明确的时间盒 `UNVERIFIED` 记录 + F1–F6 结果 + 能力矩阵完整 + `V2-D2` 已入决策台账并回写 `V2-PLAN.md`。此后才能进入迭代 02（M0 三份 RFC）。
