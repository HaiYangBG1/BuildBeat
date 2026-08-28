# BuildBeat v2 终版规划：工件协议 × 确定性内核 × 可恢复 Agent Loop

> 文档状态：**正式执行基线**（2026-08-27，项目所有者已拍板 `V2-D0=B`；决策见 [`V2-DECISIONS.md`](V2-DECISIONS.md)）
> 基线日期：2026-08-27
> 合并来源：报告 A（[`V2-PROPOSAL.md`](V2-PROPOSAL.md)，产品/方向层）× 报告 B（[《BuildBeat v2：AI 原生软件交付控制平面》](BuildBeat%20v2%EF%BC%9AAI%20%E5%8E%9F%E7%94%9F%E8%BD%AF%E4%BB%B6%E4%BA%A4%E4%BB%98%E6%8E%A7%E5%88%B6%E5%B9%B3%E9%9D%A2.md)，运行时工程层）
> 合并原则：**"为什么做、做成什么样"以 A 为准；"引擎怎么造"以 B 为准**；两者冲突处在 §2 逐条裁决并给理由。
> 收尾修订：纳入盲点复盘的三处修正（§2 末「收尾修正」）——**M-1 人肉内核试点先于一切**、**组装优先于自研**、范围裁剪与新增风险。第一个迭代已就绪：[`V2-ITERATION-01.md`](V2-ITERATION-01.md) + 试点套件 [`pilot/`](../pilot/README.md)。

---

## 0. 一页结论

### 定位语

> **BuildBeat v2 是一个工件驱动的 AI 交付闭环。确定性内核按 Workflow 与 Policy 推进状态，外部 Agent 作为 Worker 执行计划、构建、验证、修复与审查；一切完成以 Runner 回读的真实证据为准；人只在不可委托的判断点被请求最小决策。协议（工件 + 证据 + 决策）永远人机可读、落在 Git——Runner 是引擎，不是协议存在的前提。**

### 产品公式（采纳 B）

```text
BuildBeat v2
= Artifact Protocol（工件协议，Git 中，人机可读）
+ Deterministic Kernel（状态机 / 事件 / Policy，不解释自然语言）
+ Agent Loop Runtime（调度 / 重试 / 预算 / 恢复）
+ Execution Adapters（Mock / Shell / 专用 Agent，厂商中立）
+ Evidence Ledger（回读证据，不信自然语言声明）
+ Human Escalation（最小决策请求 + 精确绑定的 Approval）
```

### MVP 核心承诺（采纳 B，原文保留）

> **给 BuildBeat 一个已批准的目标和计划，它会自动完成 Build–Verify–Fix–Review 循环，并携带完整证据停在合并决定前。**

### v1 → v2 关键变化

| 维度 | v1 | v2 终版 |
|---|---|---|
| 节拍器 | 人 | Orchestrator（人只保留拍板者角色） |
| Gate | 固定四个，看板令牌，事后检查 | Policy 附着在任意状态转换与危险动作上，行动时裁决，六值结果 |
| 阶段 | 写死在协议里 | **内核阶段无关**；`plan/build/review` 等由 Workflow 预设定义 |
| 状态 | 手写 NOW/看板/status | 事件派生；手写状态文件全部废除 |
| Approval | `Gate3: passed` 文字令牌 | 绑定 transition + candidate + digest，对象一变自动失效 |
| 完成证据 | 会话自报 + bus-check 抽查 | Runner 回读命令退出码 / Git / 报告，自然语言不算证据 |
| Skill-only | 与 CLI 完整等价 | **协议等价保留，自动化等价取消**（见 §5） |

---

## 1. 为什么合并，而不是二选一

两份报告单独执行都会失败，且失败方式互补：

- **只按 A 做**：产品方向正确但运行时欠设计。"Runner 零私有状态、一切在 git"在锁、重试计数、会话信息这类高频运行态上不成立，开工两周内必然返工；没有 Approval 过期模型、没有失败指纹和无进展检测、没有 Worker 输入输出合同——自动 Loop 的安全性全靠"到时候再说"。
- **只按 B 做**：工程蓝图精良但产品层有三个盲区。① 默认 Workflow 是 Intent→Plan→Build，**没有 spec/设计阶段**——v1 单项目最大成本来源（lessons #3：静态稿拍板→返工螺旋）会原样复发；② 全盘取消 Skill-only 等价、宣布手工模式为降级兼容，把 v1 最有价值的护城河（协议不依赖任何安装、任何厂商即可用）一并扔掉；③ Kernel-first 的推进顺序（前 4–5 周只有模拟器可看）对单人项目的动力学很危险，且没有度量、observe 闭环只有一个名字。

合并的分工一句话：**B 造引擎，A 定方向和护城河。**

---

## 2. A/B 冲突裁决表

| # | 冲突点 | A 的主张 | B 的主张 | 终版裁决 | 理由 |
|---|---|---|---|---|---|
| 1 | 运行时状态放哪 | 全在 git，Runner 零私有状态 | 双平面：工件在 git，运行态在 `.buildbeat/runtime/` | **B**，加一条 A 精神的硬约束：runtime 目录可整体删除，只丢进行中 Run，不丢任何已接受事实 | 锁/重试/会话逐条 commit 进 git 不现实；但"删 runtime 无损"保住了 git 作为唯一长期真相 |
| 2 | 阶段是否进内核 | 六工件闭环是核心模型 | 内核只认通用 Run/Step 状态，业务阶段由 Workflow 定义 | **B**；A 的六工件降级为官方默认预设 `software-delivery` 的内容 | A 在这点上重复了 v1 写死四 Gate 的错误；阶段可配置才对得起"Gate 可增删改"的前提 |
| 3 | spec/设计阶段 | 保留，UI 项目强制真渲染拍板 | 默认流程无 spec | **A**：默认预设含可选 spec 步；UI 项目的 spec approval 对象必须包含可渲染入口 + 截图 digest | lessons #3 是 v1 付出代价最大的教训，不能因为换架构就重新交一次学费 |
| 4 | Skill-only / 手工模式 | 双驱动模式，工件不可区分 | 取消等价，手工是降级兼容 | **折中，偏 A**：把 v1 的一个承诺拆成两个——**协议等价保留**（工件人手可写可读、attended 会话是一等公民、任何 AI 工具可参与），**自动化等价取消**（没有 Runner 就没有调度/重试/恢复，不假装有） | 协议中立是 BuildBeat 区别于厂商 runtime 的生存位；B 的诚实（自动能力无法无 runtime 等价）也该保留 |
| 5 | 首个 Adapter | 直接绑日常主力工具 | Mock + Shell 先行，专用 Adapter 后置 | **B** | Shell Adapter 配置化后本来就能驱动 `claude -p` / `cursor-agent`，A 的目标经由 B 的路径达成，还不绑厂商（lessons #15） |
| 6 | observe / 生命周期闭环 | 现在就设计（bands.yaml、自动 intent） | 点名为后续版本，无设计 | **折中**：实现推后到 M5 起步，但**接口现在冻结**——drift-check/live-status 定义为 Evidence Provider，bands 分层响应进 RFC | 不提前设计，M5 时会发现内核缺事件入口；提前实现则 MVP 失焦 |
| 7 | 度量 | git 派生指标进范围 | 缺席（仅 M5 有验收指标） | **A**：`buildbeat metrics` 本地只读，六指标起步；B 的 M5 指标表并入验收 | lessons #8（没数据就永远在"精密地做不重要的事"）；文章的度量纪律不需要遥测服务 |
| 8 | 里程碑顺序 | 纵切优先，每段止损 | Kernel-first，M3 才见真实 Loop | **折中，偏 A 的顺序 + B 的内容**：events.jsonl 格式 day-1 冻结（事后补事件溯源最痛），但 replay/simulator 打磨推后；M1 就出真实项目可跑的纵切 | 单人项目最大风险是 B 自己列的"长期停留在架构设计"；纵切早见价值 + ledger 格式先冻结，两头都保 |
| 9 | 定位词 | 工件驱动闭环 | AI 原生交付控制平面 | **对外用"交付闭环/控制面"皆可，产品之魂写明是协议** | 运行时正被厂商商品化（Claude Code hooks、Cursor 云 agent、GitHub agentic workflow）；协议 + 参考实现才是可防守的位置，纯 orchestrator 是和厂商正面对撞 |
| 10 | 时间线 | 8–14 周 | 15 周 | **5–15 周，由 M-1 结论决定**（见收尾修正一），每个里程碑带独立止损 | 两边估计都按单人 + AI 辅助；取重排后的现实值 |

### 收尾修正（2026-08-27 盲点复盘后追加）

A/B 两份报告共享三个盲区，本节修正对合并结论生效：

1. **修正一：验证顺序倒置。** v1 的每个零件蒸馏自实践（19 条 lessons），而 v2 此前的全部工程决策只有文档来源——`intent→plan→build→verify→fix→review` 这条工作流没有任何人在真实项目上手动完整走过一遍。文章自己的采用路径是"先手动逐步跑，循环是终态"。因此新增里程碑 **M-1 人肉内核试点**，置于一切工程投入之前；M1–M3 的内核范围由 M-1 结论决定（分叉见 §8）。
2. **修正二：组装优先于自研。** 裁决 #9 已认定"运行时正被厂商商品化、协议才是护城河"，但原排期把约 7 周花在自研运行时（kernel / 事件溯源 / scheduler）上——这是计划内部的自相矛盾。确立原则：**能由厂商 runtime + 薄脚本组装出来的能力一律不自研**；自研只保留厂商结构性不会做的部分（跨工具的 approval staleness、统一证据台账、policy/gate 语义检查器）。
3. **修正三：范围裁剪与新增风险。** ① `migrate-v1` importer 砍掉——真实装机量 N=1（自己的几个项目），半天手工 runbook 替代；② 风险表新增两项此前无人列出的成本：**运维者角色转变**（v2 是需要 debug 的常驻系统，v1 是零运维的文档+脚本）与 **prompt injection 成为一等攻击面**（无人值守 Worker 消费仓库内任意文件）。

---

## 3. 核心模型

### 3.1 实体（采纳 B）

Project / Work / Run / Workflow / Step / Worker / Adapter / Artifact / Evidence / Policy / Decision / Event / Workspace 十三实体，定义照 B §6.1。要点：

- **Work**（用户级目标）与 **Run**（一次执行）分离：一个 Work 可多次 Run，只有一个最终 accepted candidate——这是 v1"任务包信封"的严格化。
- **内核阶段无关**：Kernel 只认 Run/Step 通用状态（CREATED/QUEUED/RUNNING/WAITING_HUMAN/BLOCKED/SUCCEEDED/FAILED/CANCELLED/SUPERSEDED 等）；`plan/build/verify/review` 由 Workflow 文件定义。

### 3.2 官方 Workflow 预设（A 的内容装进 B 的容器）

内核不写死阶段，但产品必须开箱可用，提供两个官方预设：

**`software-delivery`**（MVP 交付）：

```text
Intent → [Spec] → Plan → Build → Verify ⇄ Fix → Independent Review ⇄ Fix → WAIT_HUMAN(merge)
```

- `Spec` 步默认可选；**识别到 UI/视觉/交互交付时强制**，且其 Approval subject 必须包含可渲染入口与截图 digest（v1 规则⑩ + lessons #3 的 v2 化）。
- 快轨（fast preset）跳过 Intent/Spec 人批；重轨（controlled preset）在 Intent、Plan、Merge、Release 四处人批——v1 三轨映射为三个 Risk Preset（B §WP4.3），四旧 Gate 完整形态保留为 `legacy-four-gates` 迁移预设。

**`observe`**（M5 起步，接口 M0 冻结）：

```text
探测器（drift-check / live-status / verify-status 重组为 Evidence Provider，周期运行）
→ bands 分层：log → 只读诊断 → 生成 Intent 草稿入队
→ 人分诊（fix now / schedule / dismiss，dismiss 回调 bands 阈值）
→ 接受的 Intent 进入 software-delivery，闭环成立
```

### 3.3 Gate 统一结果（采纳 B）

```text
PASS / RETRY / ROUTE / WAIT_HUMAN / BLOCK / UNVERIFIED
```

`UNVERIFIED` 永不隐式当作 `PASS`——v1 fail-closed 文化的内核化。

### 3.4 Policy 四类 + 强制三等级（采纳 B，A 的 hook 编译并入）

前置 / 后置 / 转换 / Action 四类 Policy（B §11.2）；每条声明强制等级：

| 等级 | 手段 |
|---|---|
| `ADVISORY` | prompt / 规则提示 Worker |
| `LOCAL_ENFORCED` | Runner 关卡、Workspace 写路径限制、git hook、工具层 hook（Claude Code hooks 等由 gates 配置编译生成） |
| `SERVER_ENFORCED` | 分支保护、CI、部署平台 |

`buildbeat doctor` 报告每条 Policy 实际达到的强制等级，不宣称未强制的规则已被强制（B §11.4 + v1 fail-closed）。

### 3.5 Approval 合同（采纳 B；这是 lessons #18 的机器化）

人批绑定精确对象：`transition + candidate commit + planDigest + evidenceDigest`。任一受保护输入变化 → `APPROVAL_STALE`，Run 回到 `WAITING_HUMAN`。v1 靠纪律维持的 `SUPERSEDED` 语义从此由内核保证。审批动作同时落 `Decision` 事件与 git 中的决策记录（v1 decisions.md 语义保留，录入自动化）。

### 3.6 Evidence Contract（采纳 B，保留 A/v1 的分级）

字段照 B §13（kind/subject/producer/command/exitCode/digest/coverage/status/adapter…），追加一个字段：`grade: L0–L4`——v1 的证据分级语义原样保留，作为 Policy 可引用的最低证据门槛（如"标准轨合并最低 L3"）。**Worker 的自然语言总结永远不能单独作为通过证据**；candidate、工作树、测试结果、截图一律由 Runner 回读。

### 3.7 Loop 与终止条件（采纳 B）

三种 Loop（Step 内反馈 / Workflow 交付 / 生命周期）与全部终止条件照 B §9–10：maxAttempts、失败指纹（step+command+exitCode+错误摘要+diff digest）连续两次相同即停、无进展检测、预算与超时、越 Scope 即 `BLOCK`。MVP 默认值照 B §10。

---

## 4. 存储与状态

**双平面**（采纳 B §14）：

- **Git 平面**：Workflow/Policy/Worker 定义、standards、Intent/Spec/Plan、accepted candidate 引用、Review 报告、Decision、Evidence manifest、Work 最终摘要，以及每个终态 Run 的不可变 `run-record.json`。
- **Runtime 平面**（`.buildbeat/runtime/`，gitignored）：events.jsonl（append-only，唯一权威）、state.json（加速快照，可丢弃重建）、锁、会话、临时日志。

**终态压实合同**：Run 进入 `SUCCEEDED / FAILED / CANCELLED / SUPERSEDED` 后、允许清理 runtime 前，Runner 必须在对应 Work 下生成 `runs/<run-id>/run-record.json`，至少固化事件区间与 digest、开始/结束时间、attempts/budget、终止原因、base/candidate、Evidence manifest digest、Decision/Approval 引用和未验证范围。压实失败时不得宣称 Run 已归档，也不得清理其 Event Ledger。原始高频事件和临时日志可留在本地；长期审计、度量和终态解释不得依赖仍然存在的 runtime 目录。

**附加硬约束**（A 的精神，写进不变量）：删除整个 runtime 目录只损失进行中的 Run 与未承诺长期保留的原始日志，不损失任何已接受事实或已压实的终态 Run 记录；`state.json` 损坏不影响 events.jsonl；事件格式自 M1 起冻结版本号。

**派生视图**（采纳 A）：`buildbeat status` / `work list` 从事件与工件渲染全景；需要落盘时输出 `*.generated.md` 并标注生成时间，只读。v1 的 NOW/看板/status 手写体系不迁移——lessons #1/5/7/11 整类问题从"被检查器抓"变为"结构上不可能"。

---

## 5. 协议与 Runner 的关系（对 B §17.2 的修正）

v1 的"Skill-only 完整等价"拆成两个承诺分别处置：

| 承诺 | v2 处置 |
|---|---|
| **协议等价** | **保留**。工件是 markdown/YAML，人手可写可读；attended 交互会话（人开 Cursor/Claude Code 推进某一步）产出的工件与 headless run 不可区分；任何 AI 工具无需安装 BuildBeat 即可消费和产出工件 |
| **自动化等价** | **取消**（B 正确）。调度、重试、恢复、预算、staleness 检测只存在于 Runner；手工模式不假装拥有它们 |

理由：协议中立（不绑厂商、不绑安装）是 BuildBeat 相对于各家 agent runtime 的差异化生存位，也是 v1 用户的迁移桥；但 v1 把"手工能做所有事"扩大成"手工与工具等价"，在自动 Loop 时代确实不再成立。

---

## 6. evals 与度量

- **evals/**（B WP5.2 目录结构 + A 的触发时机）：AGENTS.md、Workflow、Policy、Worker prompt 任一变更即全跑；每次真实事故收敛后新增一条永久回归；BuildBeat 自身仓库同样适用。
- **`buildbeat metrics`**（A）：本地只读，从事件与 git 计算——Intent→accepted 时长、Plan→merge-ready 时长、首轮 Run 直达 WAITING_HUMAN 率、Fix 轮次分布、每个人批点等待时长、observe 发现→合并修复转化率。无采集无上传；B 的 M5 退出指标表并入 M4 验收（§8）。

---

## 7. 目录结构（B 为基础，A 增补）

```text
<project>/
├── AGENTS.md                        # 项目规则入口（保留；不再承载状态/调度）
├── standards/                       # STACK/CODE/REVIEW/DESIGN（保留，Policy 输入）
├── .buildbeat/
│   ├── project.yaml
│   ├── workflows/
│   │   ├── software-delivery.yaml   # 官方预设（含可选 spec 步）
│   │   └── observe.yaml             # M5 起步；schema M0 冻结
│   ├── policies/                    # default / protected-actions / risk-preset
│   ├── workers/                     # planner/builder/fixer/verifier/reviewer
│   ├── adapters/                    # mock / shell / manual
│   ├── evals/                       # 行为回归
│   └── runtime/                     # gitignored；可整体删除
└── delivery/
    └── work/WORK-001/
        ├── work.yaml / intent.md / spec.md / plan.md
        ├── decisions.jsonl / reviews/ / evidence/ / summary.md
        ├── runs/RUN-001/run-record.json    # 终态事件摘要、digest 与度量事实
        └── ...
```

---

## 8. 里程碑（重排：试点先行 → 纵切优先，每段独立止损）

总窗口 **~12–15 周**（`V2-D2=A` 已决完整内核，2026-08-28；单人 + AI 辅助）。仓库策略采纳 B：`v1-maintenance` 分支冻结 1.x（只修安全/严重缺陷），`v2` 分支开发，npm `latest` 留 v1、`next` 发 v2 预发布。

### M-1 — 人肉内核试点（1–2 周，先于一切工程投入）★ 收尾新增

在真实项目上手动完整走一遍 v2 工作流：**人扮演 Kernel**（批转换、做合并决定），一个百行级 shell 脚本只自动化 build→verify→fix 内环，agent 经 CLI headless 调用。

- 试点套件已就绪：[`pilot/`](../pilot/README.md)（驱动脚本 + intent/plan 模板 + 度量表）；执行细则见 [`V2-ITERATION-01.md`](V2-ITERATION-01.md)；
- 建议跑 3 轮（修 bug / 小功能 / 含 UI 各一），同时执行 F1–F6 故障注入；记录计划外人工介入、token/费用、卡点，并按 [`pilot/metrics.md`](../pilot/metrics.md) 计算有明确分母的**可组装能力加权覆盖率**；
- 时间盒 ≤2 周，超时即按已有记录强制做分叉决定，防止试点本身变成拖延；
- **分叉退出（M-1 唯一的交付就是这个决定）**：
  - **结论 (a)** 可组装能力覆盖率 <80%，或重复出现无法由薄控制面修补的 CRITICAL 运行缺口 → 按完整 M1–M3 造内核，需求以试点记录为准，总窗口 ~12–15 周；
  - **结论 (b)** 可组装能力覆盖率 ≥80%、三轮平均计划外介入 ≤2，且无重复的未处置 CRITICAL 运行缺口 → M1–M3 收缩为**薄内核**（只造 approval staleness、统一证据台账、policy/gate 检查器三件），总窗口 ~5–8 周；
  - 未跑场景一律记 `UNVERIFIED`，不得按通过计分；中间态默认少造，将存疑能力挂到 M4 复验。

> **进展（2026-08-28）**：ChickAI、Tide 与 `V2-D1A` 后续的 AI 底座 `WP-B1-AUTHZ` 推进均未激活 `pilot/loop.sh`，自动 Run ledger 为 `0/3`；第三项不倒算合格自动 Run，只作为重复激活失败的负向证据。F5 已确认只能 fail-closed、不能恢复，F6 已确认没有持久化 Approval 对象或 stale 事件；暂定可组装覆盖率仍为 45.8%。[`V2-D2-DECISION-CARD.md`](V2-D2-DECISION-CARD.md) 推荐完整内核，项目所有者已于 2026-08-28 拍板 **`V2-D2=A`**：M-1 关闭，进入 M0；主判据为重复 CRITICAL 缺口，暂定覆盖率仅旁证（台账见 [`V2-DECISIONS.md`](V2-DECISIONS.md)）。明细见 [`V2-ITERATION-01.md`](V2-ITERATION-01.md)、[`pilot/metrics.md`](../pilot/metrics.md) 与 [`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../pilot/evidence/2026-08-28-m1-runtime-gap.md)。

### M0 — 核心重置（1 周）

- 三份 RFC（产品定位 / 领域模型 / Workflow+Policy，B WP0.1–0.3），**需求来源必须引用 M-1 试点记录**，**observe 与 bands 的 schema 一并冻结**（裁决 #6）；
- 内核范围按 M-1 分叉结论定稿（完整内核 vs 薄内核），并逐项标注"自研理由 = 厂商结构性不做"（收尾修正二）；
- events.jsonl 事件格式 v1 冻结（裁决 #8）；
- v1 冻结 + 分支建立；本文档拍板即 M0 的人工 Gate。
- **退出**：核心名词、MVP 范围、旧概念处置（保留/转换/删除）无歧义。

> **进展（2026-08-28）**：三份 RFC 草案与事件格式规格已就绪——[`v2/RFC-0001-product-definition.md`](v2/RFC-0001-product-definition.md)（含自研面逐项"厂商结构性不做"标注）、[`v2/RFC-0002-domain-model.md`](v2/RFC-0002-domain-model.md)（含核心名词消歧与 v1 概念处置表）、[`v2/RFC-0003-workflow-policy.md`](v2/RFC-0003-workflow-policy.md)（含 observe/bands schema 冻结）、[`v2/SPEC-0001-events-v1.md`](v2/SPEC-0001-events-v1.md)（定稿即 FROZEN）。待项目所有者评审定稿，定稿即 M0 退出；跟踪见 [`V2-ITERATION-02.md`](V2-ITERATION-02.md)。

### M1 — 最小纵切（2–3 周）

不追求内核完备，追求**一条真实可跑的纵线**：

- events.jsonl + 简化 reducer（replay/simulator 打磨推后）；
- 最小 Workflow parser；Workspace Manager（worktree + 锁 + candidate 回读）；
- Mock + Shell Adapter；Evidence Collector v0（command/exitCode/diff/digest）；
- `run start/status/stop`，单 Project 单 Run 前台；
- **验收**：真实项目上 `build → verify` 两步由 Shell Adapter 驱动跑通，证据全部来自回读。
- **止损**：纵切显示单人维护成本过高 → 降级为"单步推进 + 审批收件箱"半自动形态，M2 以后重排。

### M2 — 自动修复环（2–3 周）★ MVP 承诺在此达成

- Verify 失败 → Fix → Verify 循环；Review（fresh-context 只读 Reviewer Worker，v1 reviewer 机制迁入）→ P0/P1 回 Fix；
- budgets / 失败指纹 / 无进展检测 / 超时；
- `WAITING_HUMAN` + `approve/reject` + inbox；Approval 绑定与 stale 检测；
- **验收**：B §20 的 20 条 MVP DoD 逐条通过（含预埋 Bug 自动修复、进程中断可恢复、candidate 变更 Approval 失效、停在合并前不自动 merge）。

### M3 — 治理硬化（2 周）

- Policy Engine 完整（四类 + 组合算子）；Protected Actions（merge/deploy/publish/force-push 无凭据即无能力，B WP4.4）；
- 强制等级报告；三个 Risk Preset（fast/standard/controlled）+ `legacy-four-gates` 迁移预设；
- UI 真渲染 Gate（spec approval subject 含渲染证据）；resume/replay 补全。

### M4 — evals、度量与试点（2–3 周）

- 确定性测试套件（B WP5.1）+ 行为 evals（B WP5.2 九目录）；
- `buildbeat metrics` v0；
- Self-host 试点（BuildBeat builds BuildBeat）+ 外部试点 ≥2（一个有真实测试的单仓项目 + 一个含 UI 变更的项目，建议从老乡鸡底座选）；
- **退出指标**（B M5 表采纳）：状态转换可追溯 100%、stale Approval 复用 0、超预算继续运行 0、试点 Run 自动到达 WAITING_HUMAN ≥70%、证据完整率 ≥95%、Reviewer 改代码 0。

### M5 — 闭环起步、迁移与 Beta（2–3 周）

- observe v0：drift-check/live-status 接入为 Evidence Provider，bands 前两层（log / 只读诊断）上线，自动 Intent 草稿入队；
- v1 迁移改为**半天手工 runbook**（收尾修正三：装机量 N=1，importer 工具砍掉；"不猜旧状态有效性、单向迁移、禁止双写"原则不变）；
- 文档十件套（B WP6.3）；发布 `@haiyangbg/buildbeat@2.0.0-beta.1`（dist-tag `next`）。

---

## 9. 系统不变量（B 的 20 条全部采纳，另加 3 条）

B §24 的 1–20 原样进入测试矩阵。追加：

21. 手写状态文件不得成为任何状态的权威来源；派生视图只读且标注生成时间。
22. UI 交付的 spec/design Approval subject 必须包含可渲染证据（入口 + 截图 digest），静态描述不构成拍板对象。
23. 删除 `.buildbeat/runtime/` 整个目录后，所有已接受工件、Decision、Evidence manifest 与已终结 Run 的压实记录必须仍可从 Git 完整读出；长期度量与终态解释不得依赖已删除的 runtime。

---

## 10. 风险（合并去重）

| 风险 | 应对 |
|---|---|
| 范围过大、停在架构设计（B 首要风险，A 的单人带宽风险同源） | 纵切优先的里程碑重排 + 每段止损；M1 结束必须有真实项目可跑证据 |
| 过早绑定 Agent 工具 | Mock/Shell 先行；专用 Adapter M3 末按试点主力工具再选（裁决 #5） |
| Agent 无限修复 / 伪造证据 / 改控制文件 | budgets + 失败指纹 + 回读制证据 + 控制文件只读与 Workspace 隔离（B） |
| Approval 过期 / 人批退化成盖章 | digest 绑定 + stale（B）；待批项强制携带 findings 摘要与风险声明，秒批率入 metrics（A） |
| Runtime 损坏 | 事件溯源 + 原子快照 + 不变量 23（runtime 可全删） |
| 设计返工螺旋复发 | UI 真渲染 Gate 进默认预设与不变量 22（A / lessons #3） |
| v1 用户断层 / 双写冲突 | v1 只冻结不删除；手工 runbook 单向迁移；`latest` 在 Beta 前不指向 v2（B） |
| 定位与厂商 runtime 对撞 | 协议中立写进产品之魂（裁决 #9）+ 组装优先原则（收尾修正二）：自研面只留厂商结构性不做的部分 |
| 运维者角色转变（v2 是需要 debug 的常驻系统，v1 是零运维文档+脚本） | 薄内核路线压缩自研面；不变量 23（runtime 可全删重建）让"删了重启"成为默认排障手段 |
| prompt injection 成为一等攻击面（无人值守 Worker 消费仓库内任意文件） | unattended run 自 MVP 起要求工具白名单 + 出网限制 + 无生产凭据；无法满足时降级 attended |

---

## 11. 已生效决策与下一道人工门

`V2-D0=B` 采用的是本文整份执行基线，因此 D1–D6 已按下表推荐项同步生效，无需重复拍板；D7 / `V2-D1` 也已于 2026-08-27 点名两个真实工作项，当前进入试点执行与证据收集。

| # | 决策 | 推荐 | 备注 |
|---|---|---|---|
| D1 | 对外定位词 | "AI 原生交付控制面/闭环"，文档明示协议是产品之魂 | 裁决 #9 的理由 |
| D2 | 仓库与版本策略 | 同仓双分支 + `latest`/`next` 双 dist-tag（B §18） | v1 资产不迁不删 |
| D3 | spec 步默认策略 | UI 项目强制、其余可选、快轨跳过 | 裁决 #3 |
| D4 | 首个专用 Adapter | M3 末按试点主力工具定（此前 Shell Adapter 已可驱动任意 CLI agent） | 裁决 #5 |
| D5 | v1 手写状态处置 | 迁移即一步到位废除，无过渡双轨 | A-D4 原结论，B 同向 |
| D6 | 试点组合（M4） | Self-host + 底座内一个有测试的单仓项目 + 一个含 UI 项目 | 合并 A-D5 与 B-WP5.3/5.4 |
| D7 / `V2-D1` + `V2-D1A` | **M-1 试点工作项与第三目标项目（已决）** | 首批为 ChickAI 额度耗尽仍可登录（含 UI）与 Tide 悬浮球空闲收纳（小功能）；第三目标项目为 `AI底座/底座`，具体使用其下一项自然发生、已授权、低风险的非生产开发任务 | 执行细则见 [`V2-ITERATION-01.md`](V2-ITERATION-01.md)；既有候选只作回放证据，授权边界仍是不 merge、不 push、不发布、不部署 |

---

_本文已由项目所有者以 `V2-D0=B` 拍板为 v2 执行基线：报告 A 降级为方向背景（其对文章与 v1 教训的论证继续有效），报告 B 降级为运行时设计输入（其 §6/§10–14/§19–24 被本文引用的部分随本文生效）。v1 的 `ROADMAP.md` / `EXECUTION-PLAN.md` 转入 v1-maintenance 语境，不再指导新开发。_
