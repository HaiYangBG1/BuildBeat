# RFC-0002：BuildBeat v2 领域模型

> 状态：`FINAL`（2026-08-28 项目所有者定稿，`V2-D3`）
> 日期：2026-08-28
> 上游：[`V2-PLAN.md`](../V2-PLAN.md) §3–4；报告 B §6 / §13 / §14（经基线裁决修订）
> 需求来源：[`pilot/metrics.md`](../../pilot/metrics.md) 卡点 1–5；[`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../../pilot/evidence/2026-08-28-m1-runtime-gap.md)

---

## 1. 十三实体

| 实体 | 定义 | 权威存放 |
|---|---|---|
| **Project** | 项目配置、仓库、Workflow、Policy 和 Adapter 集合 | Git（`.buildbeat/project.yaml`） |
| **Work** | 一个要达成的用户级结果，生命周期可跨多个 Run | Git（`delivery/work/<id>/work.yaml`） |
| **Run** | 对一个 Work 的一次具体执行，可失败、重试或被替代 | Runtime（进行中）→ Git（终态压实为 run-record） |
| **Workflow** | Step、Transition 和默认执行顺序的声明 | Git（`.buildbeat/workflows/`） |
| **Step** | 一次可调度执行单元（如 plan、build、verify） | Workflow 定义；执行状态在 Runtime |
| **Worker** | 具有某种能力的逻辑执行者（如 builder、reviewer） | Git（`.buildbeat/workers/`） |
| **Adapter** | 将 Worker 映射到 Claude / Codex / Shell 或其他执行环境 | Git（`.buildbeat/adapters/`） |
| **Artifact** | Worker 产生或消费的版本化工件 | Git（`delivery/work/<id>/`） |
| **Evidence** | 对某个声明进行证明的机器或人工证据 | Git（manifest）+ Runtime（原始日志） |
| **Policy** | 判断某次转换或动作是否允许的规则 | Git（`.buildbeat/policies/`） |
| **Decision** | 人类对精确工件或状态转换作出的决定 | Git（`decisions.jsonl`）+ Event |
| **Event** | Run 中发生的不可变事实记录 | Runtime（events.jsonl）；终态摘要压实进 Git |
| **Workspace** | 某个 Worker 实际工作的隔离目录、分支或 worktree | Runtime 元数据 + git worktree |

**Work 与 Run 分离**：一个 Work 可多次 Run，只有一个最终 accepted candidate。M-1 卡点 2/4 的补充要求：**一个 Work 可显式绑定多个 Workspace**（meta 仓 + 代码仓），全部 candidate 由同一 Run 绑定到同一 Decision；MVP 运行时先只支持单仓执行，但领域模型自 day-1 保留多 Workspace 绑定位，防止后续 schema 破坏性变更。

## 2. 状态模型

内核**阶段无关**：只认下列通用状态，`plan/build/review` 等业务阶段由 Workflow 定义。

```text
Work:  OPEN → COMPLETED | CANCELLED
Run:   CREATED → QUEUED → RUNNING → (WAITING_HUMAN | BLOCKED)*
         → SUCCEEDED | FAILED | CANCELLED | SUPERSEDED
Step:  PENDING → READY → RUNNING → SUCCEEDED | FAILED | SKIPPED | CANCELLED
```

规则：

- Run 终态（SUCCEEDED/FAILED/CANCELLED/SUPERSEDED）默认不可逆，不能被普通事件重新打开（不变量 11）；
- 状态一律由事件派生（reducer），任何手写状态文件不得成为权威来源（不变量 21）；
- 每次状态转换必须对应一个 Event（不变量 5）；
- Worker 永远不能直接修改 Run 状态，其 `suggestedAction` 只是建议（不变量 2）。

## 3. Gate 统一结果（GateResult）

```text
PASS / RETRY / ROUTE / WAIT_HUMAN / BLOCK / UNVERIFIED
```

`UNVERIFIED` 永不隐式当作 `PASS`（不变量 7）。语义与转换规则见 [`RFC-0003`](RFC-0003-workflow-policy.md) §3。

## 4. Evidence Contract

字段（报告 B §13 + 基线追加 `grade`）：

| 字段 | 含义 |
|---|---|
| `kind` | test / build / review / screenshot / deployment 等 |
| `subject` | 所证明的 Artifact 或 candidate |
| `producer` | Runner / Worker / 外部系统 / 人 |
| `command` / `exitCode` | 实际执行命令与退出码（适用时） |
| `startedAt` / `finishedAt` | 执行时间 |
| `digest` | 证据内容摘要 |
| `location` | 本地路径或外部权威引用 |
| `coverage` | 已覆盖和未覆盖范围 |
| `status` | passed / failed / unverified |
| `adapter` | 证据来源 Adapter |
| `grade` | **L0–L4**，v1 证据分级语义原样保留，Policy 可引用最低门槛（如"标准轨合并最低 L3"） |

铁律：**Worker 的自然语言总结永远不能单独作为通过证据**；candidate、工作树、测试结果、截图一律由 Runner 回读（M-1 能力矩阵"证据来源"行 PARTIAL 的直接回应：事后人工汇总、截图无 digest 在 v2 结构上不可能）。

## 5. Approval 合同

人批绑定精确对象：

```yaml
decision: approved | rejected
transition: review-to-ready-for-merge
subject:
  candidate: <commit>
  planDigest: sha256:...
  evidenceDigest: sha256:...
approvedBy: <human>
approvedAt: <ISO-8601>
```

任一受保护输入变化 → `APPROVAL_STALE`，Run 回到 `WAITING_HUMAN`（不变量 3/4/16）。M-1 卡点 3 的追加要求：涉及部署的 Approval subject 还必须能绑定 image digest、rollout plan 与 rollback floor（字段随 `subject` 扩展，additive）。审批动作同时落 `Decision` 事件与 Git 决策记录。

## 6. 存储双平面与终态压实

- **Git 平面**：定义类（Workflow/Policy/Worker/standards）、工件类（Intent/Spec/Plan、accepted candidate 引用、Review 报告、Decision、Evidence manifest、Work 摘要）、以及每个终态 Run 的不可变 `run-record.json`。
- **Runtime 平面**（`.buildbeat/runtime/`，gitignored）：events.jsonl（append-only，唯一权威）、state.json（可丢弃重建的加速快照）、锁、会话、临时日志。

**终态压实合同**：Run 进入终态后、允许清理 runtime 前，Runner 必须生成 `delivery/work/<id>/runs/<run-id>/run-record.json`，至少固化：事件区间与 digest、起止时间、attempts/budget、终止原因、base/candidate、Evidence manifest digest、Decision/Approval 引用、未验证范围。压实失败不得宣称已归档，也不得清理其 Event Ledger。

**硬约束**（不变量 23）：删除整个 runtime 目录只损失进行中的 Run 与未承诺保留的原始日志，不损失任何已接受事实或已压实的终态记录；`state.json` 损坏不影响 events.jsonl。

## 7. 核心名词表（消歧）

| 名词 | 唯一含义 | 常见误用（禁止） |
|---|---|---|
| **candidate** | Workspace 中由 Git 回读固定的候选 commit | ≠ "最新代码"；未固定即无 candidate |
| **accepted** | 经 Decision 明确接受的工件版本 | ≠ "写完了"；无 Decision 不算 accepted |
| **base / baseline** | Run 开始时校验过的基线 commit | ≠ 分支名 |
| **oracle** | 冻结的验收判据（如 `ACCEPT_CMD`），必须在基线先失败 | ≠ 事后补写的测试 |
| **evidence** | 满足 §4 合同、由回读产生的记录 | ≠ Worker 的文字总结 |
| **ledger** | append-only 的 events.jsonl（唯一运行态权威） | ≠ 任何手写日志 |
| **run-record** | 终态 Run 压实进 Git 的不可变摘要 | ≠ 进行中状态 |
| **approval** | 绑定 digest 的持久化审批对象 | ≠ 聊天里的"可以" |
| **stale** | 受保护输入变化导致审批自动失效 | ≠ 超时过期 |
| **UNVERIFIED** | 无法安全判断，需升级/补证/暂停 | ≠ 默认通过 |

## 8. v1 概念处置表（保留 / 转换 / 删除）

报告 B §17.1 经基线裁决修订后的最终版：

| v1 概念 | 处置 | v2 去向 |
|---|---|---|
| Evidence-based completion | 保留 | 升级为 Evidence Contract（§4，含 grade L0–L4） |
| 独立 reviewer（fresh-context、固定 candidate、只读、closure） | 保留 | 升级为标准 Reviewer Worker（M2 迁入） |
| fail-closed / `UNVERIFIED` | 保留 | 内核化为 GateResult 语义 |
| Git 版本化事实 | 保留 | 但不承载运行态（双平面，§6） |
| `AGENTS.md` | 保留 | 项目规则入口；不再承载状态/调度/handoff |
| `standards/`（STACK/CODE/REVIEW/DESIGN） | 保留 | Policy 输入工件 |
| 证据分级 L0–L4 | 保留 | Evidence `grade` 字段 |
| decisions.md | 转换 | Decision 事件 + `decisions.jsonl` + 导出视图 |
| 固定 Gate1–Gate4 | 转换 | `legacy-four-gates` 迁移预设（非核心） |
| 产品/全栈/测试三视角 | 转换 | 可选 Worker Preset（非默认） |
| `pm/changes/` | 转换 | Work + Artifact |
| `bus-check.sh` | 转换 | 拆为确定性 Evidence Provider + Policy Check |
| `verify-status.sh` / `drift-check.sh` / `live-status` | 转换 | Evidence Provider（observe 预设，schema 见 RFC-0003 §8） |
| 三轨（快/标准/重） | 转换 | 三个 Risk Preset（fast/standard/controlled） |
| `NOW.md` / 当期看板 / `pm/status/{视角}.md` | 删除 | 状态由事件派生；只提供 `*.generated.md` 只读视图 |
| Skill-only 完整等价 | 拆分 | 协议等价保留、自动化等价取消（RFC-0001 §5） |
| CLI 不调用 Agent | 删除 | Kernel 确定性、Runner 可调用外部 Agent |
| `migrate-v1` importer | 删除 | 半天手工 runbook（收尾修正三，装机量 N=1） |

## 9. M0 退出核对（本 RFC 承担的部分）

- [x] 十三实体定义与权威存放无歧义：§1
- [x] 状态模型与派生规则：§2–3
- [x] Evidence / Approval 合同：§4–5
- [x] 存储边界（Artifact vs Runtime）：§6（报告 B §27 要求 M0 定案的决策点）
- [x] 核心名词无歧义：§7
- [x] 旧概念全部标记保留/转换/删除：§8
