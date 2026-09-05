# v2 迭代 01：M-1 人肉内核试点

> 状态：**已收尾——`V2-D2=A` 已拍板（2026-08-28，完整内核）**。pilot-app、Tide 与后续 AI 试点工作区 `WP-B1-AUTHZ` 推进均由当前会话人工编排，自动 Run ledger 为 `0/3`；F5/F6 已从 `UNVERIFIED` 收敛为 `MISSING`。决策卡见 [`V2-D2-DECISION-CARD.md`](V2-D2-DECISION-CARD.md)，台账见 [`V2-DECISIONS.md`](V2-DECISIONS.md)；M-1 关闭，进入迭代 02（M0）
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8；决策台账：[`V2-DECISIONS.md`](V2-DECISIONS.md)；试点套件：[`pilot/`](../pilot/README.md)
> 时间盒：**≤2 周**（自 `V2-D1` 起算）；到期未跑完也必须按已有证据形成分叉结论或明确 `UNVERIFIED`

## 迭代目标（唯一交付）

依据三轮真实任务与六个故障注入场景，形成 `V2-D2`：

- **(a) 完整内核**：关键运行能力存在重复、无法由薄控制面修补的结构性缺口，总窗口约 12–15 周；
- **(b) 薄内核**：可组装能力覆盖充分，BuildBeat 只自研 approval staleness、统一证据台账、policy/gate 检查器，总窗口约 5–8 周。

v2 已由 `V2-D0=B` 决定正式实施；M-1 不再拥有“放弃 v2”的隐含第三选项。

## 任务清单

- [x] **T1（项目所有者，`V2-D1` + `V2-D1A`）**：首批工作项为 pilot-app 额度耗尽仍可登录（含 UI）与 Tide 悬浮球空闲收纳（小功能）；第三个目标项目已选定为 `<试点工作区>`，具体采用该项目下一项自然发生、已授权、低风险的非生产开发任务，不另造演示需求。
- [ ] **T2（每个执行工作项）**：pilot-app 与 Tide 均已准备独立 `ACCEPT_CMD`，在原基线先失败、实现后通过；第三项尚未冻结工作项与 oracle。
- [ ] **T3（每个执行工作项）**：pilot-app 与 Tide 均使用 `pilot/*` 专用 branch/worktree，intent、plan、protected paths 与验收 oracle 先独立提交；第三项尚未建立隔离现场。
- [ ] **T4（每轮）**：当前两项没有运行 [`pilot/loop.sh`](../pilot/loop.sh)，attempts/token/费用也没有统一 ledger；人工阶段数不得冒充自动 Loop 数据。下一轮必须由脚本从干净 oracle commit 开跑。
- [ ] **T5（每轮）**：pilot-app 候选与两个精确 release commit 均完成独立只读审查；其中 reviewer 抓出单阶段滚动 P1，最终 stage1/stage2 分别收敛为无 P0/P1。Tide 仅完成回归/验收与视觉检查；两项均未由脚本产生 `WAITING_HUMAN` 终态，故本项未完成。
- [x] **T6（故障注入）**：`npm run test:pilot` 当前 15/15；F1～F4 保持 fail-closed，F5 证实中断后只能阻断、不能恢复，F6 证实无持久化 Approval 对象、无 stale 事件。测试绿只表示缺口被稳定观测，不表示 F5/F6 能力通过。
- [x] **T7（三轮或时间盒到期）**：[`V2-D2-DECISION-CARD.md`](V2-D2-DECISION-CARD.md) 已形成并于 2026-08-28 由项目所有者拍板 `V2-D2=A`；已回写 [`V2-PLAN.md`](V2-PLAN.md) §8 与 [`V2-DECISIONS.md`](V2-DECISIONS.md)。

> `V2-D2=A` 拍板后，T2–T5 中面向「第三轮 / 下一轮自动 Run」的未完成项随 M-1 关闭而终止：三次真实任务未产生合格自动 Run 的事实保持原样记录（不补跑、不倒算），对应缺口由 M1（Run/事件/恢复纵切）与 M2（Approval stale + fix/review loop）关闭。

## 2026-08-27 当前证据

- **pilot-app（含 UI + 生产）**：原始实现 `f78f64c`、证据 `d31c056`；生产 reviewer 发现单阶段滚动 P1 后拆为 `0.17.84@8e41661` 铺服务端门，再以 `0.17.85@7aa570c` 开启。最终 ops `f2495d5`、tag `v0.17.85`、digest `30d4ebc0…`、ChangeOrder `4ba5f72d…`；unit 158/158、额度 UI5 3/3、两实例同 revision、Running/Healthy/0 重启、逐实例/公网/钉钉 smoke 通过。真人 quota OAuth 仍待回访。
- **Tide（小功能）**：`pilot/tide-idle-ball`，实现 `723289c`，证据 `4217708`；Node 测试 3/3、Rollup build、syntax/diff check 通过。证据目录：`pilot-work/tide-idle-ball/evidence/`。
- **AI 试点工作区（第三次激活失败观察，不倒算自动 Run）**：在 `V2-D1A` 已明确“下一项自然任务必须进 Loop”之后，`WP-B1-AUTHZ` 仍由当前会话在脚本外推进到 Gate3 写者 L4，meta 记录为 `9d258ee`；没有 Run ID、attempt/cost ledger、checkpoint 或 Approval 对象。用户下一轮主动指出目标应是升级 BuildBeat v2，才把主线拉回。该事件不冒充低风险开发任务或合格自动 Run，但构成第三次真实激活失败。完整证据见 [`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../pilot/evidence/2026-08-28-m1-runtime-gap.md)。
- **共同边界**：pilot-app 的 push/deploy 来自试点之后的单独生产授权，不反向扩大 M-1 权限；Tide 未更新 `tide.zip`、未发布。两个交付完成与一次生产发布都不等于两轮自动 Loop 通过。

## 使用判定（回答“两个例子够不够”）

- **够投入使用**：含 UI 与小功能两种任务都走通了冻结 oracle、隔离 worktree、实现、回归与证据；pilot-app 的独立 reviewer 还真实阻止了一次不安全的单阶段生产滚动，证明协议不是摆设。
- **足够形成 `V2-D2` 决策卡，但不支持薄内核结论**：三次真实工作均没有自动激活；F5/F6 已确认 `MISSING`，暂定可组装覆盖率仍为 45.8%。这些负向证据不能冒充成功 Run，却已满足完整内核路线的提前止损信号。
- **第三项目已选定**：`<试点工作区>` 同时覆盖 legacy 1.x、多仓、在途 Gate 与高密度历史证据，是比演示项目更有价值的第三例；但选择项目不等于产生有效 run。
- **执行口径**：`V2-D2=A` 已拍板，进入完整内核 M0/M1，不再等待 AI 试点工作区第四项任务。不回放改写旧 candidate，也不专门造演示需求。

## 分叉判据

- **结论 (b) 薄内核**：可组装能力加权覆盖率 ≥80%，三轮平均计划外介入 ≤2，且没有在两轮以上重复出现、无法由三项薄内核能力修补的 CRITICAL 缺口。
- **结论 (a) 完整内核**：覆盖率 <80%，或至少两个 CRITICAL 运行缺口在两轮以上重复出现，或中断恢复/多步状态必须持续依赖人脑记忆。
- **中间态**：默认取 (b)，将存疑能力挂到 M4 复验；任何未跑场景必须标 `UNVERIFIED`，不得按通过计分。

指标与计算表见 [`pilot/metrics.md`](../pilot/metrics.md)。approval staleness、统一证据台账、policy/gate 检查器是已确定的薄内核自研面，不拿它们人为压低“可组装能力覆盖率”。

## 边界

- M-1 本身不授权 merge/push/deploy；pilot-app 后续生产动作来自项目所有者另行明确授权，不能外推给 Tide 或其它试点任务。
- AI 试点工作区当前不做 in-place v2 升级：v2 尚无发布 tag/预发布包，目标项目又没有可机械升级的 manifest，且现有工作树/在途 Gate 不能被试点污染。第三轮采用旁路 `pilot/*` worktree；若工作项跨仓，所有 candidate 必须由同一 run 显式绑定。
- 提示词禁令只算 `ADVISORY`；必须移除 agent 的生产/发布凭据，并尽量使用宿主权限与网络限制。做不到就登记缺口，不得宣称已机器强制。
- 只选低风险工作项；v1 维护线不因试点而改变运行行为。
- 零新增运行时依赖；试点 evidence 留在专用工作目录，清理 branch/worktree 前先保留。

## 完成定义

三次真实流程观察 + F1–F6 结果 + 能力矩阵 + `V2-D2` 决策卡已齐；项目所有者已于 2026-08-28 选择 **A**，`V2-D2` 已入台账并回写 `V2-PLAN.md`。本迭代关闭，进入迭代 02（M0 三份 RFC + events v1 / observe schema 冻结）。
