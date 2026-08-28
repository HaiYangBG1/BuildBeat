# RFC-0001：BuildBeat v2 产品定位

> 状态：`FINAL`（2026-08-28 项目所有者定稿，`V2-D3`；M0 随三份 RFC 与 [`SPEC-0001-events-v1.md`](SPEC-0001-events-v1.md) 定稿退出）
> 日期：2026-08-28
> 上游：[`V2-PLAN.md`](../V2-PLAN.md)（执行基线，`V2-D0=B`）；内核范围：完整内核（`V2-D2=A`，[`V2-DECISIONS.md`](../V2-DECISIONS.md)）
> 需求来源：M-1 试点记录——[`pilot/metrics.md`](../../pilot/metrics.md)（能力矩阵 + 卡点 1–5）、[`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../../pilot/evidence/2026-08-28-m1-runtime-gap.md)（F5/F6）、[`V2-ITERATION-01.md`](../V2-ITERATION-01.md)

---

## 1. 定义

> **BuildBeat v2 是一个工件驱动的 AI 交付闭环。确定性内核按 Workflow 与 Policy 推进状态，外部 Agent 作为 Worker 执行计划、构建、验证、修复与审查；一切完成以 Runner 回读的真实证据为准；人只在不可委托的判断点被请求最小决策。协议（工件 + 证据 + 决策）永远人机可读、落在 Git——Runner 是引擎，不是协议存在的前提。**

对外定位词可用"AI 原生交付控制面 / 交付闭环"（[`V2-PLAN.md`](../V2-PLAN.md) 裁决 #9、D1）；**产品之魂是协议**：厂商 runtime 正在被商品化，协议 + 参考实现才是可防守的位置。

MVP 核心承诺：

> **给 BuildBeat 一个已批准的目标和计划，它会自动完成 Build–Verify–Fix–Review 循环，并携带完整证据停在合并决定前。**

## 2. 是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 工件协议（Intent/Spec/Plan/Candidate/Evidence/Review/Decision，Git 中，人机可读） | 一个 AI Coding 工具或模型路由平台 |
| 厂商中立的确定性内核：状态机 / 事件 / Policy，不解释自然语言 | 某家 Agent runtime 的包装层或竞争性 orchestrator |
| 可恢复的 Agent Loop 运行时（调度 / 重试 / 预算 / 恢复） | 无人值守的自动合并 / 自动部署系统（MVP 停在合并前） |
| 证据台账：完成以 Runner 回读为准，自然语言声明不算证据 | 效能考核、遥测或排行榜产品（度量本地只读） |
| 人类升级机制：最小决策请求 + 精确绑定的 Approval | 多人 RBAC / SSO / Web 后台（MVP 之外） |

MVP 明确不做的完整清单以报告 B §19.2 为准（多仓、多 Run 并发、后台 daemon、自动 merge/deploy、远程共享等）。

## 3. 用户

第一阶段：使用 Claude Code / Codex / Cursor 等 AI Coding 工具的个人开发者；一人同时驱动多个 AI Worker、希望把 Build–Verify–Fix–Review 连成自动闭环、但保留合并与发布权的场景。后续扩展（远程 Runner、PR/CI 驱动、多仓）不进入 MVP 承诺。

## 4. Runner 的地位

Runner 是**引擎**：调度、重试、恢复、预算、staleness 检测只存在于 Runner。但 Runner 不是协议存在的前提——工件是 markdown/YAML，任何 AI 工具无需安装 BuildBeat 即可消费与产出工件。

M-1 的核心教训（卡点 1、卡点 5）：协议工件齐备但没有 Runner 时，**人仍是节拍器**——三次真实任务自动激活率 `0/3`，"人记得调用薄脚本"不能兑现自动闭环。因此 v2 的 Runner 不是可选增强，而是自动化承诺的唯一载体。

## 5. 手工模式的地位

v1 的"Skill-only 完整等价"拆成两个承诺（[`V2-PLAN.md`](../V2-PLAN.md) §5）：

| 承诺 | v2 处置 |
|---|---|
| **协议等价** | **保留**。工件人手可写可读；attended 会话（人开任意 AI 工具推进某一步）产出的工件与 headless run 不可区分；任何工具无需安装即可参与 |
| **自动化等价** | **取消**。手工模式没有调度 / 重试 / 恢复 / 预算 / stale 检测，不假装有 |

## 6. v1 的地位

v1 进入 `v1-maintenance` 维护线，只修安全与严重缺陷；npm `latest` 留 v1，`next` 发 v2 预发布；Beta 前 `latest` 不指向 v2。v1 迁移采用半天手工 runbook（装机量 N=1），`migrate-v1` importer 已裁掉（收尾修正三）。旧概念的保留/转换/删除逐项见 [`RFC-0002`](RFC-0002-domain-model.md) §8。

## 7. 自研面与组装面（逐项自研理由）

原则（收尾修正二）：**能由厂商 runtime + 薄脚本组装出来的能力一律不自研**；自研只保留厂商结构性不会做的部分。`V2-D2=A` 选择完整内核，不改变这一原则——它只把 M-1 证实"薄脚本做不到"的部分纳入自研面。每一项标注理由与 M-1 证据：

### 7.1 自研面（完整内核范围）

| # | 组件 | 自研理由（= 厂商结构性不做） | M-1 证据 |
|---|---|---|---|
| 1 | **Run 登记与状态机**（Run/Step 通用状态、转换裁决） | 厂商的"任务"绑定自家会话与账号体系；没有厂商会为跨工具、跨仓的工件协议维护中立状态机 | 卡点 1、卡点 5：无 Run 登记入口，三次任务全部绕过脚本 |
| 2 | **事件台账 + reducer + 终态压实**（events.jsonl、state 重建、run-record） | 厂商日志是私有格式、随会话消亡、不落 Git；工具中立、可重放、可审计的交付台账没有厂商会提供 | 卡点 1：attempts/token/费用无统一 ledger；度量表全列 `UNVERIFIED` |
| 3 | **中断恢复**（checkpoint、resume、恢复点裁决） | 厂商的 session resume 只恢复自家会话上下文，不恢复跨 Worker 的交付状态（该继续 Verify、回 Build 还是废弃候选） | F5 = `RECOVERY_MISSING`：重开只能 fail-closed，需人读现场 |
| 4 | **Approval 对象与 stale 检测**（transition + candidate + planDigest + evidenceDigest 绑定） | 厂商审批是工具内 UI 动作，不产生持久化、跨工具、绑定 digest 的审批对象，更不会在对象变化时自动失效 | F6 = `APPROVAL_STALE_MISSING`；卡点 3：单阶段生产滚动 P1 正是"审批未绑定 rollout plan"的真实事故形态 |
| 5 | **Policy/Gate 语义检查器 + 强制等级报告**（四类 Policy、`doctor` 报告实际强制等级） | 厂商各有权限系统，但没人会检查"你声称的规则实际达到哪级强制"并跨工具编译到 hook/CI | 边界节：提示词禁令只算 `ADVISORY`；ChickAI 会话始终持有生产能力，未被机器剥离 |
| 6 | **多 Workspace 绑定**（一个 Work 绑定多仓 candidate 到同一 Decision） | 厂商 Workspace 即"当前打开的仓"；跨 meta 仓 + 代码仓的原子绑定是协议层需求 | 卡点 2、卡点 4：ChickAI 与 AI 底座均为 meta+代码多仓，单仓 loop 无法原子关联 |
| 7 | **统一 Evidence Contract**（回读制证据、grade L0–L4、manifest digest） | 厂商各自产出日志与测试结果，但"什么算证据、谁回读、怎么分级"的合同必须工具中立 | 能力矩阵"证据来源、digest 与未验证范围"= PARTIAL：事后人工汇总、截图无 digest |

### 7.2 组装面（一律不自研）

| 能力 | 组装来源 |
|---|---|
| Agent 执行本身（计划/编码/修复/审查） | Claude Code / Codex / Cursor 等，经 Shell Adapter 配置化驱动（裁决 #5，不绑厂商） |
| 测试 / 构建 / lint | 项目自己的命令，Verify 步只回读退出码与报告 |
| `SERVER_ENFORCED` 强制 | 分支保护、CI、部署平台（BuildBeat 只报告，不重造） |
| 工具层 hook（`LOCAL_ENFORCED` 的一部分） | 由 gates 配置**编译生成**厂商 hook（如 Claude Code hooks），不自研 hook 机制 |
| 隔离原语 | git worktree / branch；BuildBeat 只做其上的锁与 candidate 回读 |
| 触发入口 | 尽量复用宿主机制（git hook / cron / CI 触发调用 `run start`）；自研的是 Run 登记与状态，不是定时器 |

## 8. M0 退出核对（本 RFC 承担的部分）

- [x] BuildBeat 是什么 / 不是什么 / 谁使用：§1–3
- [x] Runner 是否核心：§4（引擎，非协议前提；自动化承诺的唯一载体）
- [x] 手工模式地位：§5（协议等价保留，自动化等价取消）
- [x] v1 是否继续演进：§6（维护线，不演进）
- [x] 自研逐项标注"厂商结构性不做"：§7

---

_核心名词与旧概念处置见 [`RFC-0002`](RFC-0002-domain-model.md)；Workflow/Policy/审批语义见 [`RFC-0003`](RFC-0003-workflow-policy.md)；事件格式见 [`SPEC-0001-events-v1.md`](SPEC-0001-events-v1.md)。_
