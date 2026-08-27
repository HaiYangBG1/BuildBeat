# M-1 试点度量记录

> 真实任务表与故障矩阵共同构成 `V2-D2` 的证据。只填其中一张不能做分叉决定；数据随运行填写，不事后补写。

## 真实任务

| # | 日期 | 工作项 | 性质 | attempts | 基线验收失败 | 最终回归/验收 | 计划外介入 | token/费用（约） | 卡点摘要 |
|---|---|---|---:|---:|---|---|---:|---:|---|
| 1 | 2026-08-27 | ChickAI：额度耗尽仍可登录网站，模型发送禁用且不补发 Key | 含 UI + 生产发布 | 5（人工阶段；含发布重构） | PASS：冻结 oracle 在 `9d571b3` 非零 | `0.17.85` 已上线；unit 158/158、UI5 3/3、typecheck/lint/build；两阶段双 reviewer 无 P0/P1；两实例同 revision、Healthy/0 重启 | 1（reviewer P1 迫使单阶段改两阶段；非 loop ledger） | `UNVERIFIED` | 候选成功不代表发布安全：独立 reviewer 抓出新旧 Pod 混跑可绕 Agent/Excel 的 P1，先发 `0.17.84` 铺硬墙、再发 `0.17.85` 开功能；全过程仍由当前会话人工编排 |
| 2 | 2026-08-27 | Tide：悬浮球空闲缩入左侧并半透明隐藏 | 小功能 | 1（人工实现轮次） | PASS：冻结 oracle 在 `e5c130d` 非零 | Node 3/3；Rollup build/syntax/diff PASS；截图已留 | `UNVERIFIED`（未走 loop ledger） | `UNVERIFIED` | 原目录无 Git，先建立本地可回滚基线；未做 fresh-context reviewer |
| 3 | 2026-08-27～28 | AI 底座：`WP-B1-AUTHZ` Gate3 非生产证据推进 | legacy v1.21 + 多仓真实项目；仅作激活失败观察 | `MANUAL_OUTSIDE_LOOP` | `UNQUALIFIED` | 写者 L4 已到 `9d258ee`，但无自动 Run/恢复/审批 ledger | 1（用户主动纠正主线） | `UNVERIFIED` | `V2-D1A` 已要求下一项任务进 Loop，实际仍被当前会话手工推进；不倒算自动 Run，作为第三次激活失败负向证据。见 [`evidence/2026-08-28-m1-runtime-gap.md`](evidence/2026-08-28-m1-runtime-gap.md) |
| 4 | 待定（仅选择 B 时） | AI 底座：下一项自然发生、已授权的低风险非生产开发任务 | 合格自动 Run 候选 | `WAITING_TASK` | `UNVERIFIED` | `UNVERIFIED` | `UNVERIFIED` | `UNVERIFIED` | 选择 B 才继续等待；不补造需求、不回放旧 candidate |

> 第 1～3 行均是**真实流程观察**，但都不是 `pilot/loop.sh` 的有效 run record；第 3 行尤其发生在 `V2-D1A` 之后，证明“选定目标 + 写下协议”仍不能自动激活 Loop。attempts 仅表示人工阶段，不进入自动 Run 平均值；token 与费用继续保持 `UNVERIFIED`。第 4 行不是既成任务，只表示选择 B 后的等待路径。

> **使用判定**：三次真实工作足以证明工件协议、冻结验收、隔离 candidate 与独立审查有价值，也足以证明“靠人记得调用薄脚本”不能兑现 v2 的自动闭环。F5/F6 已从 `UNVERIFIED` 收敛为 `MISSING`；当前证据足以形成 `V2-D2` 决策卡，但不支持薄内核结论。详见 [`../docs/V2-D2-DECISION-CARD.md`](../docs/V2-D2-DECISION-CARD.md)。

> **第三项目口径**：`AI底座/底座` 已选定，`WP-B1-AUTHZ` 后续又在 Loop 外推进到 Gate3 写者 L4。该事件是合格的激活失败证据，不是合格的自动 Run。选择 A 后不再等第四项任务；选择 B 时才等下一项自然工作包并从旁路干净 worktree 开跑。

## 能力覆盖矩阵

结果只允许 `COVERED / PARTIAL / MISSING / N/A`。等级权重：`CRITICAL=2`、`NORMAL=1`；得分：`COVERED=1`、`PARTIAL=0.5`、`MISSING=0`，`N/A` 不进分母。

| 能力 | 等级 | 适合组装？ | 结果 | 证据/场景 | 计划外介入 | 去向：assemble / thin-core / full-core / defer |
|---|---:|---|---|---|---:|---|
| Agent 调用与异常退出留痕 | CRITICAL | 是 | PARTIAL | fixture 可阻断 non-zero；两真实交付及 ChickAI 生产发布仍无统一 agent/run log | 1 | assemble：下一轮必须实际由 loop 驱动 |
| 基线假绿阻断 + 双验证 | CRITICAL | 是 | COVERED | fixture 阻断 baseline-green；两项目均先红后绿，回归与 ACCEPT 分离 | 0 | assemble |
| Verify→Fix 收敛与预算上限 | CRITICAL | 是 | PARTIAL | ChickAI reviewer 在发布前抓出单阶段滚动 P1并收敛为两阶段，但无机器 MAX_ATTEMPTS/预算 ledger | 1 | assemble；真实 loop 复验 |
| fresh-context Reviewer 只读 | CRITICAL | 是 | PARTIAL | fixture 指纹阻断 reviewer 写入；ChickAI 候选与两个精确 release commit 均独立只读审查，Tide 未跑 | 1 | assemble；真实 loop 复验 |
| 进程中断后的状态恢复 | CRITICAL | 是 | MISSING | F5 fixture 在 Verify 中止后重开只会因 dirty worktree fail-closed；无 checkpoint/Run ID/reducer/resume | 1 | full-core：Run/event/recovery 纵切 |
| candidate/plan 变化后 Approval stale | CRITICAL | 否，默认 thin-core | MISSING | F6 fixture 确认 `WAITING_HUMAN` 后无持久化 Approval/Decision 对象，candidate 变化无 stale 事件 | 1 | thin-core，但依赖内核事件与状态面 |
| 证据来源、digest 与未验证范围 | CRITICAL | 否，默认 thin-core | PARTIAL | 两项目有 commit/summary/run-record/边界；ChickAI 生产又有镜像 digest、ChangeOrder、逐实例回读，但仍为事后人工汇总且截图无 digest | 1 | thin-core |
| Policy/Scope/受保护路径强制 | CRITICAL | 部分，默认 thin-core | PARTIAL | fixture 可阻断 protected mutation；真实候选只做阶段后 diff 检查 | 1 | thin-core + 宿主能力 |
| 无 merge/push/deploy/生产能力 | CRITICAL | 部分 | PARTIAL | ChickAI 在后续单独生产授权下实际完成 push/deploy；边界被人工遵守，但执行会话仍持有生产能力，未证明凭据/网络被机器剥离。Tide 始终未发布 | 1 | 宿主隔离 + policy |
| UI 真渲染入口 + 截图 digest | NORMAL | 是 | PARTIAL | 两项目均留 PNG，未自动生成/绑定 digest | 1 | assemble + thin ledger |
| token/time/cost 可读预算 | NORMAL | 是 | MISSING | 本轮未采集 | 1 | adapter/runtime telemetry |

当前“适合组装”行的**暂定加权覆盖率 = 45.8%（5.5/12）**。它混合了 fixture 与人工候选证据，且两真实任务未走 loop，**不得用作 `V2-D2` 最终分叉值**；下一轮有效 run 后重算。

**组装覆盖率**只计算“适合组装？= 是”的非 `N/A` 行：

```text
Σ(等级权重 × 结果得分) / Σ(等级权重) × 100%
```

“部分”行单独做架构判断，不能为了凑 80% 强行归入分母。

## 故障注入

| 场景 | 预期 | 结果 | 证据 |
|---|---|---|---|
| F1 Agent 非零退出 | Run 阻断，旧测试绿色不得掩盖 | PASS（fixture） | `npm run test:pilot` 15/15：non-zero 与旧绿隔离两断言通过 |
| F2 `ACCEPT_CMD` 基线已绿 | 开跑前阻断 | PASS（fixture） | 同上：agent 调用前阻断且原因明确 |
| F3 Builder/Fixer 修改 protected path | 立即阻断并指出路径 | PASS（fixture） | 同上：阻断并输出 `accept.sh` |
| F4 Reviewer 修改任意工作区内容 | 指纹变化，立即阻断 | PASS（fixture） | 同上：workspace fingerprint 检出写入 |
| F5 Verify 中途杀进程后重开 | 明确恢复点；若靠人记忆则记结构性缺口 | MISSING（fixture，safe-block） | Builder 产出候选后 Verify 终止父 Loop；重开返回 2 并要求干净工作树，无恢复点。见 [`evidence/2026-08-28-m1-runtime-gap.md`](evidence/2026-08-28-m1-runtime-gap.md) |
| F6 Approval 后 candidate/plan 改变 | 旧 Approval 必须失效；pilot 做不到则记 thin-core 需求 | MISSING（fixture） | 到达 `WAITING_HUMAN` 后没有持久化 Approval/Decision 文件；候选变化不产生 `APPROVAL_STALE`。同上证据 |

## 卡点登记

### 卡点 1

- 现象：两个真实任务完成了 oracle、实现、回归和证据，但没有从干净基线调用 `pilot/loop.sh`；attempts/token/cost 无标准 ledger。
- 根因：执行纪律缺口——当前会话直接承担了 Kernel/Builder/Verifier，未把当前 Codex 会话接成脚本 Adapter。
- 当时怎么绕过：人工维护 worktree、阶段性验证、受保护路径 diff、独立 reviewer 与事后 run-record。
- 若有内核，它应该做什么：未登记 Run 就不允许给 M-1 计分；统一调 Adapter、采集退出码/attempts/budget，并自动压实 evidence。
- 对应能力矩阵行：Agent 调用与异常退出留痕、Verify→Fix、token/time/cost。

### 卡点 2

- 现象：ChickAI 行为改在子仓，但决策/契约/状态位于独立 meta 仓；单仓 loop 无法把两个 candidate/evidence 原子关联。Tide 原目录甚至没有 Git 基线。
- 根因：目标项目先决条件差异 + 当前试点只建模单仓 Workspace。
- 当时怎么绕过：ChickAI 分别创建代码与 meta worktree/branch；Tide 先建立本地 Git 基线，再冻结 oracle。
- 若有内核，它应该做什么：preflight 明确阻断或安全引导 bootstrap；Work 支持多个受控 Workspace/candidate，并把跨仓证据绑定到同一 Decision。
- 对应能力矩阵行：证据来源与 digest、Policy/Scope、进程状态恢复。

### 卡点 3

- 现象：ChickAI 功能候选本身通过审查，但精确生产候选在默认两实例滚动下出现新旧 Pod 兼容 P1；若直接单阶段发布，新 callback 可能签出 quota session，而旧 Pod 的 Agent/Excel 仍只有身份门。
- 根因：候选验收只覆盖“最终稳态”，没有把 deployment topology、mixed-version window 与 rollback floor 建模进同一个 Decision。
- 当时怎么绕过：独立 reviewer 阻断单阶段；人工拆成 `0.17.84` 先铺服务端硬墙、确认两实例同 revision 后，再用 `0.17.85` 开启功能；开启后回滚下限固定为 `0.17.84`。
- 若有内核，它应该做什么：Approval 绑定 candidate + image digest + rollout plan + rollback floor；plan 或 candidate 改变自动 stale；部署门必须验证每个实例的 revision/health 后才允许下一阶段。
- 对应能力矩阵行：Verify→Fix、Approval stale、证据来源与 digest、Policy/Scope、进程状态恢复。

### 卡点 4

- 现象：第三目标项目 AI 底座是 meta + 多代码仓的活跃项目；当前工作树同时存在未提交的 BuildBeat v1.21 手工迁移、运维脚本改动与 `ruoyi-ai` 其它在途修改。已提交基线仍为 v1.20，且项目从未有 schema 2 manifest。当前 `WP-B1-AUTHZ` 候选虽在独立 worktree clean，但 `NOW/看板` 的接力描述落后于全栈/测试/status 与 reviewer 事实。
- 根因：legacy 项目没有可机械升级基线；项目事实、候选和 Gate 分散在多个仓与多个 SSOT，当前单仓 `loop.sh` 不能原子绑定它们。
- 当时怎么绕过：只做只读 preflight，把项目登记为第三目标；不触碰目标项目、不原地升级、不补造 manifest，也不倒算既有候选。等待下一项自然、已授权任务后，以旁路 `pilot/*` worktree 从干净 oracle commit 开始。
- 若有内核，它应该做什么：提供 legacy/dirty/in-flight 的只读兼容 preflight；显式列出并绑定全部 workspace、candidate、plan/approval digest 与当前 Gate；发现接力棒/SSOT 冲突时阻断并指向真实 owner，而不是静默选择一个仓继续。
- 对应能力矩阵行：证据来源、Policy/Scope、进程状态恢复、Approval stale。

### 卡点 5

- 现象：`V2-D1A` 已明确 AI 底座下一项自然任务必须进入 Loop，但随后 `WP-B1-AUTHZ` 仍由当前会话在脚本外推进到 Gate3 写者 L4；直到用户指出“不是为了升级 BuildBeat v2 吗”才恢复主线。
- 根因：当前方案没有 artifact/event trigger、Run inbox 或强制登记入口；`pilot/loop.sh` 只有人在正确目录主动调用时才存在。
- 当时怎么绕过：用户充当目标校正器；保留业务证据，但不把它倒算为自动 Run。
- 若有内核，它应该做什么：接受的 intent/plan 或显式工作授权生成 Run，绑定全部 workspace，并在任何 Worker 开始前完成登记；没有 Run 的任务不得计入 v2 闭环。
- 对应能力矩阵行：Agent 调用与异常退出留痕、进程状态恢复、证据来源与 digest。

## `V2-D2` 分叉决定（待项目所有者拍板）

- 三次真实流程的自动激活率：`0/3`；没有合格自动 attempts 平均值，不伪造。
- 组装覆盖率：暂定 `45.8%（5.5/12）`，低于薄内核门槛 80%。
- 重复出现的 CRITICAL 结构性缺口：Run 未自动登记/激活、无统一 ledger；F5 无恢复；F6 无 Approval stale。
- 推荐结论：**(a) 完整内核**；决策卡见 [`../docs/V2-D2-DECISION-CARD.md`](../docs/V2-D2-DECISION-CARD.md)。
- 依据：继续增加手工案例不能改变激活、恢复与审批状态缺失；完整内核仍按纵切止损，不等于一次性实现全部 M1～M3。
- 各缺口去向：M1 关闭 Run/event/recovery 最小纵切；M2 关闭 Approval stale 与 fix/review loop；M3 完成 policy/protected actions。
- 决定日期与拍板人：`PENDING`。
