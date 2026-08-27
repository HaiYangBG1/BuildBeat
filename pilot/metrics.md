# M-1 试点度量记录

> 真实任务表与故障矩阵共同构成 `V2-D2` 的证据。只填其中一张不能做分叉决定；数据随运行填写，不事后补写。

## 真实任务

| # | 日期 | 工作项 | 性质 | attempts | 基线验收失败 | 最终回归/验收 | 计划外介入 | token/费用（约） | 卡点摘要 |
|---|---|---|---:|---:|---|---|---:|---:|---|
| 1 | 2026-08-27 | ChickAI：额度耗尽仍可登录网站，模型发送禁用且不补发 Key | 含 UI | 3（人工审查/修复轮次） | PASS：冻结 oracle 在 `9d571b3` 非零 | unit 157/157；冻结 unit 1/1；UI5 3/3；build PASS；review 0/0/0 | `UNVERIFIED`（未走 loop ledger） | `UNVERIFIED` | 候选交付成功；当前会话人工编排，不能计作自动 Loop 轮次；另有 meta 契约仓需手工同步 |
| 2 | 2026-08-27 | Tide：悬浮球空闲缩入左侧并半透明隐藏 | 小功能 | 1（人工实现轮次） | PASS：冻结 oracle 在 `e5c130d` 非零 | Node 3/3；Rollup build/syntax/diff PASS；截图已留 | `UNVERIFIED`（未走 loop ledger） | `UNVERIFIED` | 原目录无 Git，先建立本地可回滚基线；未做 fresh-context reviewer |
| 3 | | 待项目所有者后续决定是否补充 | 待定 | | | | | | |

> 上述两行是**候选交付实况**，不是 `pilot/loop.sh` 的有效 run record。attempts 仅表示人工阶段数，不进入 `V2-D2` 的平均 attempts；计划外介入、token 与费用没有统一采集，一律保持 `UNVERIFIED`。

## 能力覆盖矩阵

结果只允许 `COVERED / PARTIAL / MISSING / N/A`。等级权重：`CRITICAL=2`、`NORMAL=1`；得分：`COVERED=1`、`PARTIAL=0.5`、`MISSING=0`，`N/A` 不进分母。

| 能力 | 等级 | 适合组装？ | 结果 | 证据/场景 | 计划外介入 | 去向：assemble / thin-core / full-core / defer |
|---|---:|---|---|---|---:|---|
| Agent 调用与异常退出留痕 | CRITICAL | 是 | PARTIAL | fixture 可阻断 non-zero；两真实候选无统一 agent/run log | 1 | assemble：下一轮必须实际由 loop 驱动 |
| 基线假绿阻断 + 双验证 | CRITICAL | 是 | COVERED | fixture 阻断 baseline-green；两项目均先红后绿，回归与 ACCEPT 分离 | 0 | assemble |
| Verify→Fix 收敛与预算上限 | CRITICAL | 是 | PARTIAL | ChickAI 完成三轮 review/fix，但无机器 MAX_ATTEMPTS/预算 ledger | 1 | assemble；真实 loop 复验 |
| fresh-context Reviewer 只读 | CRITICAL | 是 | PARTIAL | fixture 指纹阻断 reviewer 写入；ChickAI 独立只读审查，Tide 未跑 | 1 | assemble；真实 loop 复验 |
| 进程中断后的状态恢复 | CRITICAL | 是 | MISSING | F5 未跑；当前恢复依赖会话上下文/人工摘要 | 1 | 待 F5 判断 thin-core 或 full-core |
| candidate/plan 变化后 Approval stale | CRITICAL | 否，默认 thin-core | MISSING | F6 未跑；oracle commit 存在，但无绑定 candidate/digest 的 Approval 对象 | 1 | thin-core |
| 证据来源、digest 与未验证范围 | CRITICAL | 否，默认 thin-core | PARTIAL | 两项目有 commit/summary/run-record/边界，但为事后人工汇总且截图无 digest | 1 | thin-core |
| Policy/Scope/受保护路径强制 | CRITICAL | 部分，默认 thin-core | PARTIAL | fixture 可阻断 protected mutation；真实候选只做阶段后 diff 检查 | 1 | thin-core + 宿主能力 |
| 无 merge/push/deploy/生产能力 | CRITICAL | 部分 | PARTIAL | 两项目实际未执行危险动作，但主要靠授权边界，未证明凭据/网络被机器剥离 | 1 | 宿主隔离 + policy |
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
| F1 Agent 非零退出 | Run 阻断，旧测试绿色不得掩盖 | PASS（fixture） | `npm run test:pilot` 11/11：non-zero 与旧绿隔离两断言通过 |
| F2 `ACCEPT_CMD` 基线已绿 | 开跑前阻断 | PASS（fixture） | 同上：agent 调用前阻断且原因明确 |
| F3 Builder/Fixer 修改 protected path | 立即阻断并指出路径 | PASS（fixture） | 同上：阻断并输出 `accept.sh` |
| F4 Reviewer 修改任意工作区内容 | 指纹变化，立即阻断 | PASS（fixture） | 同上：workspace fingerprint 检出写入 |
| F5 Verify 中途杀进程后重开 | 明确恢复点；若靠人记忆则记结构性缺口 | UNVERIFIED | 真实试点未运行 |
| F6 Approval 后 candidate/plan 改变 | 旧 Approval 必须失效；pilot 做不到则记 thin-core 需求 | UNVERIFIED | 真实试点未运行；当前脚本无 Approval 对象 |

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

## `V2-D2` 分叉决定

- 三轮平均计划外介入：
- 组装覆盖率：
- 重复出现的 CRITICAL 结构性缺口：
- 结论：**(a) 完整内核 / (b) 薄内核**
- 依据：
- 各缺口去向：
- 决定日期与拍板人：
