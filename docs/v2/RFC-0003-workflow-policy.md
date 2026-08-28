# RFC-0003：BuildBeat v2 Workflow 与 Policy

> 状态：`FINAL`（2026-08-28 项目所有者定稿，`V2-D3`；§8 observe/bands schema 已随定稿冻结）
> 日期：2026-08-28
> 上游：[`V2-PLAN.md`](../V2-PLAN.md) §3.2–3.7；报告 B §8–11 / WP1.4–1.5 / WP4.3–4.5
> 需求来源：[`pilot/metrics.md`](../../pilot/metrics.md) 卡点 3/5、故障矩阵 F1–F6；[`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../../pilot/evidence/2026-08-28-m1-runtime-gap.md)

---

## 1. Workflow 文件模型

内核不写死阶段；Workflow 是 Git 中的 YAML 声明（用户配置 YAML，内部以 JSON Schema 校验，schema 文件 M1 WP1.1 落地）。形状 v1：

```yaml
kind: workflow
version: 1
name: software-delivery
entry: intent
steps:
  - id: intent
    worker: planner
  - id: spec
    optional: true                # 见 §2 spec 规则
    requiredWhen: ui-delivery
    worker: planner
  - id: build
    worker: builder
  - id: verify
    worker: verifier
  # ...
transitions:
  - from: verify
    on: failed
    to: fix
  - from: review
    on: findings.maxSeverity >= P1
    to: fix
  - from: review
    on: passed
    to: wait-merge              # WAITING_HUMAN 终点
terminal: [wait-merge]
policies:                        # 引用 .buildbeat/policies/ 中的定义
  - ref: default
  - ref: protected-actions
budgets:
  maxAttempts: { build: 4, fix: 4, review-fix: 2 }
  maxSameFailure: 2
  stepTimeout: project-config
  runBudget: project-config
```

约束：`entry` 唯一；`terminal` 至少一个；transition 图不得含无出口的非终态环（M1 loop detection）；未知字段拒绝加载（fail-closed）。

## 2. 官方预设 `software-delivery`

```text
Intent → [Spec] → Plan → Build → Verify ⇄ Fix → Independent Review ⇄ Fix → WAIT_HUMAN(merge)
```

- **Spec 步默认可选；识别到 UI/视觉/交互交付时强制**，且其 Approval subject 必须包含可渲染入口 + 截图 digest（不变量 22；v1 lessons #3 的 v2 化，经 [`V2-PLAN.md`](../V2-PLAN.md) 裁决 #3）。
- 各步执行规则照报告 B §8.1：Builder 只写授权 Workspace；Fixer 输入必须含失败命令/退出码/日志摘要/candidate/允许范围，不接受泛化的"再检查一下"；Reviewer fresh-context、默认只读、不改代码、产出结构化 findings（不变量 9）。
- MVP 到 merge 决定即暂停，不自动合并（不变量 20）。

## 3. GateResult 语义

```text
PASS        → 进入下一 Step
RETRY       → 重跑当前 Step 或指定修复 Step（受预算约束）
ROUTE       → 转交另一 Worker
WAIT_HUMAN  → 持久化状态并暂停（产生 HUMAN_REQUESTED 事件）
BLOCK       → 确定性终止当前转换
UNVERIFIED  → 无法安全判断；按 Policy 升级、补证或暂停，绝不隐式当 PASS
```

## 4. Policy 四类、算子与强制等级

### 4.1 四类

| 类型 | 判断 | 例 |
|---|---|---|
| 前置（pre） | Step 能否启动 | Plan 已接受、Workspace 干净、依赖工件齐全、预算充足 |
| 后置（post） | Step 是否真正完成 | 测试通过、Evidence 齐全且达到最低 grade、candidate 已固定 |
| 转换（transition） | 下一状态 | Verify 失败→Fix；Review P1→Fix；Review 通过→WAIT_HUMAN |
| Action | Worker 内部危险动作 | merge / push / deploy / publish / migration / 删远端资源 / 改生产配置 |

### 4.2 求值算子 v1（M1 WP1.5 实现集）

```text
all / any / not
evidence.exists        # 可带 { kind, minGrade }
artifact.accepted
attempts.lt
budget.remaining
candidate.clean
human.approved
finding.maxSeverity
```

Policy 文件形状：

```yaml
kind: policy
version: 1
name: merge-evidence-floor
type: transition
appliesTo: review-to-ready-for-merge
enforcement: LOCAL_ENFORCED
rule:
  all:
    - evidence.exists: { kind: test, minGrade: L3 }
    - human.approved: { transition: review-to-ready-for-merge }
```

### 4.3 强制三等级

| 等级 | 手段 |
|---|---|
| `ADVISORY` | prompt / 规则提示 Worker（M-1 边界节确认：提示词禁令只算这一级） |
| `LOCAL_ENFORCED` | Runner 关卡、Workspace 写路径限制、git hook、工具层 hook（由 gates 配置编译生成，如 Claude Code hooks） |
| `SERVER_ENFORCED` | 分支保护、CI、部署平台 |

`buildbeat doctor` 报告每条 Policy **实际达到**的强制等级，不宣称未强制的规则已被强制（不变量 18）。Protected Actions 的最可靠实现不是提示词，而是不给 Worker 相应凭据与能力（B WP4.4；M-1 能力矩阵"无生产能力"行 PARTIAL 的回应）。

## 5. Approval 与 stale

对象合同见 [`RFC-0002`](RFC-0002-domain-model.md) §5。流程：

```text
转换 Policy 判 WAIT_HUMAN
→ HUMAN_REQUESTED 事件（携带 subject digest + findings 摘要 + 风险声明）
→ 人 approve/reject（CLI 展示当前状态、精确对象、candidate、Evidence、风险、批准后动作）
→ DECISION_RECORDED 事件 + Git 决策记录
→ 受保护输入任一变化 → APPROVAL_STALE 事件 → Run 回 WAITING_HUMAN
```

秒批率进 metrics（防止人批退化成盖章）。F6 的关闭以本节 + [`SPEC-0001`](SPEC-0001-events-v1.md) 事件为准，验收在 M2。

## 6. Loop 终止条件与 MVP 默认值

任一条件触发即停（报告 B §10 全表采纳）：maxAttempts、连续两次相同失败指纹（step + command + exitCode + 错误摘要 + diff digest）、candidate 无实质变化（无进展）、越 Scope 即 `BLOCK`、预算/超时、Workspace 不干净或锁冲突、证据不完整记 `UNVERIFIED`、Adapter 不支持必要强制能力则降级或阻断、人拒绝即 `CANCELLED`。

MVP 默认值：

```text
build/fix 最大尝试：4
review 修复轮次：2
连续相同失败：2
单 Step 超时 / 总 Run 预算：项目配置
```

## 7. Risk Preset

三个官方预设 + 一个迁移预设（都是 Preset，不是核心固定 Gate）：

| Preset | 人批点 |
|---|---|
| `fast` | 仅 Merge |
| `standard` | Plan、Merge |
| `controlled` | Intent、Plan、Merge、Release |
| `legacy-four-gates` | v1 四 Gate 完整形态（迁移用） |

## 8. observe 预设与 bands schema（随本 RFC 冻结，实现 M5）

裁决 #6：**接口现在冻结，实现推后**。冻结内容为以下 schema 形状与语义；M5 前不实现，但 M1 起任何内核设计不得与之冲突（尤其：Evidence Provider 产出的记录必须能进入同一 Evidence Contract 与事件台账）。

```yaml
kind: workflow
version: 1
name: observe
providers:                        # v1 探测器重组为 Evidence Provider
  - id: drift-check
    command: <项目配置>
    schedule: <cron 或 interval>
    evidence: { kind: drift, subject: <deploy-unit> }
  - id: live-status
    command: <项目配置>
    schedule: <cron 或 interval>
    evidence: { kind: runtime-health, subject: <deploy-unit> }
bands:                            # 分层响应；层级固定为三层，阈值可配
  - level: log                    # 层1：只记录事件
    when: <severity 表达式>
  - level: diagnose               # 层2：触发只读诊断 Worker
    when: <severity 表达式>
  - level: intent                 # 层3：生成 Intent 草稿入队（不自动执行）
    when: <severity 表达式>
triage:                           # 人分诊
  actions: [fix_now, schedule, dismiss]
  dismissFeedback: bands          # dismiss 回调 bands 阈值
```

语义冻结点：

1. Provider 输出必须满足 Evidence Contract（含 `status` / `coverage`；采不到即 `UNVERIFIED`）；
2. bands 只有 log / diagnose / intent 三层，`intent` 层只产生**草稿**入队，接受后才进入 `software-delivery`，闭环成立；
3. dismiss 必须回调 bands 阈值（防止告警疲劳单向累积）；
4. 以上字段 additive-only 演进，破坏性修改需新 `version`。

## 9. M0 退出核对（本 RFC 承担的部分）

- [x] GateResult / 转换顺序 / retry / route / block / unverified：§1、§3、§6
- [x] Human Approval 与 stale：§5
- [x] Policy 四类 + 算子 + 强制等级：§4
- [x] Risk Preset 与 legacy 迁移预设：§7
- [x] observe 与 bands schema 冻结：§8
