# SPEC-0001：Event Ledger 格式 v1（冻结）

> 状态：**FROZEN**（2026-08-28 项目所有者定稿，`V2-D3`；[`V2-PLAN.md`](../V2-PLAN.md) 裁决 #8：格式 day-1 冻结，此后 additive-only）
> 日期：2026-08-28
> 冻结范围：**信封字段、通用规则、损坏处理、reducer 合同、初始事件类型注册表的语义**。文件摆放位置、快照格式、CLI 展示均为非规范内容，可变。
> 演进规则：一切修改 **additive-only**（新增可选字段、新增事件类型）；破坏性变更必须升 `v` 并提供旧版读取器。
> 需求来源：[`pilot/metrics.md`](../../pilot/metrics.md) 卡点 1（无统一 ledger）、卡点 5（无 Run 登记）；F5/F6 见 [`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../../pilot/evidence/2026-08-28-m1-runtime-gap.md)

---

## 1. 载体

- 每个 Run 一个 ledger：append-only JSONL，UTF-8，每行一个 JSON 对象，`\n` 结尾；
- 建议路径 `.buildbeat/runtime/runs/<run-id>/events.jsonl`（非规范）；
- 只允许追加，永不改写或删除已有行；追加必须原子（单次 `O_APPEND` 写入完整行）；
- `state.json` 只是加速快照：可丢弃，必须能从 ledger 完整重建（不变量 12/13）。

## 2. 信封（frozen）

```json
{
  "v": 1,
  "seq": 42,
  "ts": "2026-08-28T04:12:33.201Z",
  "run": "RUN-001",
  "work": "WORK-001",
  "type": "STEP_FINISHED",
  "actor": { "kind": "kernel", "id": "orchestrator" },
  "data": { },
  "prev": "sha256:…",
  "digest": "sha256:…"
}
```

| 字段 | 必填 | 规则 |
|---|---|---|
| `v` | 是 | 信封版本，本规格恒为 `1`；读取器遇到未知 `v` 必须拒绝，不得猜测 |
| `seq` | 是 | 每个 Run ledger 内单调递增整数，自 `1` 起，**无间隙** |
| `ts` | 是 | ISO-8601 UTC，毫秒精度 |
| `run` / `work` | 是 | 所属 Run / Work ID |
| `type` | 是 | UPPER_SNAKE，取自 §4 注册表（注册表 additive 扩展） |
| `actor` | 是 | `kind ∈ {kernel, worker, human, adapter, provider}` + `id` |
| `data` | 是 | 类型专属载荷（§4）；载荷演进 additive-only，破坏性语义变化必须用新 `type` |
| `prev` | 是 | 前一行事件的 `digest`；首行取 `"sha256:GENESIS"` |
| `digest` | 是 | 本行除 `digest` 字段外按规范化 JSON（键排序、无空白）序列化后的 sha256 |

未知**信封**字段：读取器必须忽略（向前兼容）；未知 `type`：reducer 必须原样保留并跳过，不得报错丢弃（后写的读取器可能认识）。

## 3. 损坏处理（frozen）

1. 逐行校验 `digest` 与 `prev` 链；
2. 首个校验失败行即截断点：其后所有行视为不可信，读取器必须显式报告"ledger 在 seq=N 后损坏"，不得静默丢弃；
3. 截断后的恢复决策升级给人（`WAIT_HUMAN` 语义），内核不得猜测丢失区间；
4. 快照与 ledger 冲突时，**ledger 永远是权威**（不变量 21 的运行态版本）。

## 4. 初始事件类型注册表 v1

语义冻结；`data` 列出的字段为该类型的必填最小集，可 additive 扩展。

| type | actor | data 最小集 | 语义 |
|---|---|---|---|
| `RUN_CREATED` | kernel | `workflowRef, workflowDigest, base, riskPreset` | Run 登记（卡点 5 的回应：没有本事件的工作不得计入 v2 闭环） |
| `RUN_STARTED` | kernel | —— | 进入 RUNNING |
| `WORKSPACE_BOUND` | kernel | `workspaceId, repo, branch, worktreePath, base` | 一个 Run 可多次（多仓绑定，卡点 2/4） |
| `STEP_STARTED` | kernel | `step, attempt, worker, adapter, workspaceId` | Step 开跑 |
| `STEP_FINISHED` | kernel | `step, attempt, status ∈ {succeeded,failed,blocked,invalid-output,timeout,crashed}, exitCode?` | Adapter 异常退出也必须落此事件（不变量 15） |
| `CANDIDATE_PINNED` | kernel | `workspaceId, base, candidate` | candidate 由 Git 回读后固定 |
| `EVIDENCE_RECORDED` | kernel/provider | `evidenceRef, kind, subject, digest, status, grade` | 指向满足 Evidence Contract 的记录 |
| `POLICY_EVALUATED` | kernel | `policy, phase ∈ {pre,post,transition,action}, result ∈ GateResult, enforcement, reason` | 每次 Policy 裁决可解释 |
| `TRANSITION` | kernel | `from, to, cause` | 每次状态转换一条（不变量 5） |
| `FAILURE_FINGERPRINT` | kernel | `step, command, exitCode, errorDigest, diffDigest` | 无进展/相同失败检测的输入 |
| `BUDGET_CONSUMED` | kernel | `kind ∈ {attempts,tokens,cost,time}, amount, remaining` | 预算台账（卡点 1：token/费用不再 `UNVERIFIED`） |
| `HUMAN_REQUESTED` | kernel | `transition, subject{candidate,planDigest,evidenceDigest}, reasons` | 进入 WAITING_HUMAN |
| `DECISION_RECORDED` | human | `decision ∈ {approved,rejected}, transition, subject, decisionRef` | 同步落 Git 决策记录 |
| `APPROVAL_STALE` | kernel | `approvalRef, changed ⊆ {candidate,plan,evidence}` | F6 的机器化 |
| `CHECKPOINT` | kernel | `resumePoint{step,attempt}, workspaceStates[]` | F5 的机器化：恢复只允许从最近 CHECKPOINT 或安全推导点继续 |
| `RUN_INTERRUPTED` | kernel | `cause` | 尽力而为；崩溃时允许缺失，恢复逻辑不得依赖其存在 |
| `RUN_TERMINAL` | kernel | `status ∈ {SUCCEEDED,FAILED,CANCELLED,SUPERSEDED}, reason` | 终态默认不可逆（不变量 11） |
| `RUN_COMPACTED` | kernel | `runRecordRef, runRecordDigest` | 终态压实完成；无此事件不得清理 ledger |

## 5. Reducer 合同（frozen）

- 确定性：同一 ledger 任意次 replay 必须得到相同状态（Run/Step 状态、attempts、budgets、当前 candidate、待批请求、evidence coverage）；
- 非法转换在 append 前拒绝（写侧校验），reducer 遇到历史非法序列必须报告而非修补；
- 恢复流程：读 ledger → 校验链 → replay → 定位最近 `CHECKPOINT` / 安全推导点 → 继续或 `WAIT_HUMAN`。不存在"读会话记忆"这一步（F5 = `RECOVERY_MISSING` 的结构性关闭）。

## 6. 示例（一次 Verify 失败进 Fix）

```json
{"v":1,"seq":7,"ts":"2026-08-28T04:10:01.000Z","run":"RUN-001","work":"WORK-001","type":"STEP_FINISHED","actor":{"kind":"kernel","id":"orchestrator"},"data":{"step":"verify","attempt":1,"status":"failed","exitCode":1},"prev":"sha256:aa…","digest":"sha256:bb…"}
{"v":1,"seq":8,"ts":"2026-08-28T04:10:01.050Z","run":"RUN-001","work":"WORK-001","type":"FAILURE_FINGERPRINT","actor":{"kind":"kernel","id":"orchestrator"},"data":{"step":"verify","command":"npm test","exitCode":1,"errorDigest":"sha256:cc…","diffDigest":"sha256:dd…"},"prev":"sha256:bb…","digest":"sha256:ee…"}
{"v":1,"seq":9,"ts":"2026-08-28T04:10:01.100Z","run":"RUN-001","work":"WORK-001","type":"POLICY_EVALUATED","actor":{"kind":"kernel","id":"orchestrator"},"data":{"policy":"default.verify-failed","phase":"transition","result":"RETRY","enforcement":"LOCAL_ENFORCED","reason":"verify failed, attempts 1/4"},"prev":"sha256:ee…","digest":"sha256:ff…"}
{"v":1,"seq":10,"ts":"2026-08-28T04:10:01.120Z","run":"RUN-001","work":"WORK-001","type":"TRANSITION","actor":{"kind":"kernel","id":"orchestrator"},"data":{"from":"verify","to":"fix","cause":"policy:default.verify-failed"},"prev":"sha256:ff…","digest":"sha256:gg…"}
```

---

_M1 WP1.2 按本规格实现 Event Store；`event.schema.json`（WP1.1）以本规格为唯一来源。任何实现与本规格冲突时，先改实现；确需改规格，走 additive 或升 `v`。_
