# BuildBeat v2 规划书：从人驱动协议到工件驱动闭环

> 文档状态：**已被 [`V2-PLAN.md`](V2-PLAN.md) 合并取代（2026-08-27）**。本文（报告 A）与[报告 B](BuildBeat%20v2%EF%BC%9AAI%20%E5%8E%9F%E7%94%9F%E8%BD%AF%E4%BB%B6%E4%BA%A4%E4%BB%98%E6%8E%A7%E5%88%B6%E5%B9%B3%E9%9D%A2.md)的可取部分已并入终版，保留此文仅作方向背景与推理过程存档，不再单独执行。
> 基线日期：2026-08-27
> 输入：Anthropic《[The AI-Native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)》（2026-08-21）× BuildBeat v1.21 现状 × `lessons.md` 全部 19 条实战教训
> 前提立场（已由所有者确认）：v1 固有概念可推翻；Gate 可增删改；定位可改；不背历史包袱。

---

## 0. 一页结论

| 决策项 | v1 结论 | v2 新结论 |
|---|---|---|
| 核心隐喻 | 人是节拍器 + 拍板者，AI 会话围绕文件总线协作 | **工件驱动闭环**：已接受的工件自动触发下一阶段，人只保留拍板者角色，节拍器交给 Runner |
| 基本单元 | 工作包（会话内认领） | 工作包不变，但其生命周期 = 一次完整闭环遍历：`intent → spec → plan → change → release → observe` |
| Gate 模型 | 固定四 Gate（规格/设计/合并/上线），全部人批，禁止自定义 | **声明式 Gate 策略**：Gate 是策略文件里的条目，类型分 `machine / agent / human` 三种，四个旧 Gate 降级为默认预设 |
| Gate 执行 | 协议约定 + bus-check 事后检测 + pre-commit | **行动时强制**：hook 在动作发生的瞬间 allow/ask/block；人批 Gate 变成异步审批工件，闭环等文件而不是等聊天 |
| 状态来源 | 手写 NOW/看板/status，靠 bus-check 反腐烂 | **状态派生**：从工件与 git 历史推导，`buildbeat status` 渲染只读视图；手写状态文件全部废除 |
| 运行时 | 明确非目标（"不提供运行时编排"） | **薄 Runner 进入范围**：本地进程，无服务器无数据库，状态仍在 git；这是 v2 最大的新增件 |
| 驱动模式 | 只有交互会话（人开会话、说"开工"） | **双模**：attended（交互会话，走同一协议）+ unattended（headless run，Runner 调度） |
| 度量 | 非目标（与遥测一并排除） | **git 派生度量进入范围**：本地只读计算，不上传；遥测采集继续排除 |
| 协议自身回归 | 脚本/CLI 有测试，Agent 行为无 evals | **evals 进入范围**：AGENTS/skills/gates 变更触发 agent 行为回归 |
| 保留资产 | — | 文件总线思想、证据分级 L0–L4、fail-closed、写者≠审者、红线、drift-check、存量接管仪式、lessons 回灌、AGENTS.md 开放标准 |

### v2 定位语（草案）

> **一套工件驱动的 AI 交付闭环。已接受的工件自动触发下一阶段，机器 Gate 在行动时强制执行，人只在不可委托的判断点出现。文件与 Git 仍是唯一事实与审计轨。**

---

## 1. 背景：两个初步问题的答案

### 1.1 文章是怎么处理 Gate 的

文章没有取消 Gate，而是把「控制目标」与「执行手段」拆开：控制目标（问责、安全、合规）保留，执行手段从"人-速度的会议与评审"换成"机器-速度的行动时强制"。具体分四层：

1. **Skill = 建议性控制**。政策在写代码的当下被读取和应用（brand/security/compliance 编码为 skill），但不保证遵守。
2. **Hook = 确定性控制**。跑在 agent 每个动作之前，三种裁决：`allow / ask / block`。构建期 hook 是无人护栏（挡受保护路径、跑 linter、拦凭据）；**审批型 hook 是真正的 Gate**——暂停动作直到指定的人批准（如 production-gate.sh：deploy 命令没有 release authorization 就 exit 2 阻断）。不可协商的 hook 放 managed settings，工程师无法关闭。
3. **分支保护 + code owner = 合并 Gate**。agent 写的一切以 PR 形式到达，没有直通 main 的路径；写代码的 agent 无法批准自己的代码。
4. **Headless 闭环里的置信 Gate**。当流程无人值守运行时，阶段之间放"独立置信关卡"——确定性检查或对抗性审查 agent——决定上一阶段的产出是继续流转还是升级给人。

人的注意力被重新安置：不再逐行看 diff、不再发起每个阶段，而是**审阅已提交的工件**（intent/spec/plan/PR findings），集中在 Gate 上审 agent 标记出来的东西。工件被接受（merge/approve）这件事本身就是下一阶段的触发器。自主权按环境分层（dev 自由、staging 居中、prod 人批），按风险分层（1σ 只记录、2σ 只读诊断、3σ 才可通过 PR/预批 runbook 行动）。每个 hook 裁决带时间戳落日志，Gate 的等待时长本身是被度量的对象。

**与 v1 的关键差异一句话**：v1 的 Gate 是看板里的状态令牌 + 事后检查（bus-check 发现 `gate.na_without_reason` 时动作早已发生）；文章的 Gate 是动作发生瞬间的强制拦截 + 工件接受即触发。v1 唯一达到"行动时强制"标准的只有 pre-commit 一处。

### 1.2 我们是不是缺自动 loop——是，而且是结构性缺失

文章的终态原文："**each accepted artifact fires the next gate**"；Stage 6 更进一步："a trigger invokes Claude **with no person in the invocation path**"。监控脚本（确定性、版本控制、单元测试）盯生产指标，越带即按层级自动诊断、自动写 `intent.md`、自动进入下一轮循环，人只做队列分诊。

BuildBeat v1 是"**有协议、没引擎**"：文件总线、Gate、证据链都定义了，但每一次阶段流转都要人来点火——人开会话、说"开工"、逐段确认、收口后再开下一个会话。这不是实现漏洞，是被写进定位的设计决策（README「当前非目标」与 ROADMAP §1.2 明确排除运行时编排）。其后果正是文章开篇诊断的病：**build 塌缩到小时级之后，瓶颈移到 build 左右两侧仍以人的速度运行的环节**——v1 把人-速度的流转制度化了。v1 的检测件其实已有一半（drift-check、live-status、verify-status 都是合格的"探测器"），缺的是消费探测结果并自动开启下一轮的那只手。

---

## 2. 对照评估

### 2.1 该吸收的（按价值排序）

| # | 文章机制 | BuildBeat 现状 | 吸收方式 |
|---|---|---|---|
| 1 | **工件链即触发链**：commit 一个被接受的工件 = 触发下一阶段 | 工件齐全（契约/决策/证据），触发全靠人 | v2 核心：Runner 监听工件事件，自动开 headless run（§3.2） |
| 2 | **闭环（Stage 6）**：监控→分层响应→自动写 intent→回流水线 | drift-check/live-status 只探测，无消费者 | observe 阶段 + bands 配置 + 自动 intent 生成（§3.1/§5 Phase 3） |
| 3 | **Hook 三裁决 allow/ask/block + 审批型 hook** | 只有 pre-commit 一个强制点，Gate 靠自觉+事后查 | Gate 策略编译为 hook（Claude Code hooks / pre-commit / Runner 关卡）（§3.3） |
| 4 | **intent.md：想法在源头一次落盘** | 起点是已梳理好的看板需求，无非工程师入口、无事故入口 | intent 成为闭环第一工件，人/工单/监控三路进入同一格式（§3.1） |
| 5 | **置信 Gate**：headless 阶段间的确定性检查或对抗性审查 agent | reviewer subagent 已是对抗性审查的雏形，但一次性、人触发 | reviewer 泛化为 Runner 内建关卡类型 `agent`（§3.3） |
| 6 | **持续 evals**：steer agent 的配置享受代码级回归 | AGENTS/SKILL 改动无 agent 行为回归；事故不沉淀为 eval | `evals/` 目录 + 配置变更触发 + 事故必增 eval（§3.6） |
| 7 | **git 派生度量**：leading/lagging 指标全部从 git/PR 元数据读出 | 度量被连同遥测一起判为非目标 | `buildbeat metrics` 本地只读计算；无上传（§3.6） |
| 8 | **双向 review + babysit to merge**：AI 审 PR、AI 回应 review 意见直到只剩人批 | reviewer 只读、单发；修复循环靠人推 | change 阶段的收敛循环：checks 不绿不升级给人（§3.1） |
| 9 | **自主权分层**（环境×风险） | 三轨制已是雏形（按风险选流程重量） | 三轨映射为自主权等级，扩展环境维度（§3.3） |
| 10 | **Worktree 并行成为一等公民** | 多会话共用工作树酿成 lessons #12（半成品 SQL 进生产镜像） | 每个 unattended run 强制独立 worktree（§3.7） |

### 2.2 被证明做错、v2 必须改的

1. **人当节拍器（SKILL §1）**。"人只当节拍器+拍板者"在 2026 年是错的一半——拍板者该留，节拍器该给机器。lessons #17 记录的"人不断说继续和批准"其实不是粒度问题而是架构问题：只要流转靠人点火，任何粒度收敛都只是缓解。v1 用 4.1 任务包协议、审批分层、决策包三套机制去修"人被打断太多"，修的都是症状。
2. **四 Gate 固定 + 明文禁止自定义（ROADMAP §9.3"不增加自定义 Gate 系统"）**。四个 Gate 混淆了"阶段签收"与"审批需要"两个概念，且数量写死。文章的模型里 Gate 数量由策略决定：受监管项目可以有七道，快轨内部工具可以只有一道（上线）。v2 改为声明式策略，四旧 Gate 降级为默认预设。
3. **Gate 是事后检测不是行动时强制**。看板里的 `Gate3: pending` 令牌物理上拦不住任何会话越过它；bus-check 在 commit 时才发现，`--strict` 之外全靠 AGENTS.md 的自觉遵守。文章标准：政策必须成立的地方，skill 后面要有确定性的 hook。v1 十条规则中大部分「违反了会怎样」的答案仍是"靠自觉"——这恰是 SKILL §6.1 自己立的机器化判据。
4. **"运行时编排是非目标"（README/ROADMAP §1.2）**。当时为收敛范围是对的，现在是 v2 的第一障碍。修订：接受一个**薄 Runner**（本地进程、无服务器、无数据库、状态在 git），坚守的底线从"不做运行时"退到"不做远程服务/账号/多租户"。
5. **手写状态文件是自造的腐烂源**。lessons #1/5/7/11（SSOT 腐烂、版本声明漂移、状态膨胀、幽灵 hash）的共同根因：把可以从 git 推导的事实要求人/会话手写第二遍。v1 的对策是造更多检查器（bus-check 十几族 finding、换期压缩仪式、NOW 长肥报警）——用机器对抗自己的设计。v2 釜底抽薪：**能派生的状态一律不落盘**，NOW/看板聚合/status 全部变成 `buildbeat status` 的渲染输出；幽灵 hash 在派生模型里不可能存在。
6. **度量与遥测被一刀切排除**。lessons #8（"流程只管怎么做对，不管做的是不是对的事"，P1 挂一个月、资源连投 UI）暴露的正是无数据之痛。文章示范了不需要遥测服务的度量：全部指标从 git 历史与 PR 元数据读取。v1 把"隐私敏感的行为遥测"和"git 里本来就有的交付事实"混为一谈。
7. **协议自身没有 evals**。v1 给脚本和 CLI 建了几百条回归，但"改一行 AGENTS.md 之后 agent 行为是否退化"没有任何测试。文章：steer agent 的配置 deserves the regression testing that code gets。
8. **仪式为"会话必然失忆"设计，成本摊给每个会话**。开工 7 步/收工 7 步/域回复格式，都是在补偿"上下文在会话间丢失"。在 Runner 模型里，同步动作由引擎在 run 前后机械执行，仪式从"每个会话背诵的清单"变成"引擎的前后钩子"，交互会话只在 attended 模式下保留轻量版。
9. **缺 intent 入口**。v1 假设需求已经被人梳理进看板；想法、工单、线上事故没有标准化入口，Stage 1（Plan）与 Stage 6（Maintain）在 v1 里整体缺席。

### 2.3 必须保留的资产（v2 不推翻的部分）

- **Git 是总线与审计轨**——文章同一结论（"chain of commits is the audit trail"），v1 最有远见的决定。
- **证据制完成 + L0–L4 分级**——文章的 governance evidence 与此同构；v2 里证据改由 run 自动采集，分级语义不变。
- **fail-closed / unverified 文化**——"无法核到就明说"，直接沿用。
- **写者≠审者**——文章同款（"the agent that wrote the code has no way to approve it"）；v2 把它做进 Gate 类型而非红线口号。
- **红线**（凭据不入 git、不 `git add -A`、构建取 `git archive HEAD`）、**drift-check/live-status**（observe 阶段现成的探测器）、**存量接管仪式**（§8.5 的绞杀者边界思想不过时）、**lessons.md 回灌**、**AGENTS.md 开放标准不绑厂商**（lessons #15，v2 的 agent 适配层同样遵守）。

---

## 3. v2 核心模型

### 3.1 六工件闭环

一个工作包 = 一次闭环遍历。每个阶段以**提交一个工件**结束，工件被接受即触发下一阶段：

```
   ┌──────────────────────────────────────────────────────────┐
   │                                                          ▼
intent.md → spec.md → plan.md → change(diff+tests+evidence) → release → observe
 (想法/工单/    (需求+设计     (实现计划,   (实现+自检收敛,     (人批+hook   (监控/漂移/
  监控越带)     一次会话)      可审可改)    checks不绿不出来)    强制)        指标回看)
   ▲                                                          │
   └────────────── 越带/事故/回看结论 自动写回新 intent ←──────┘
```

- **intent**：三路进入同一格式——人写想法（attended 会话辅助起草）、外部工单（适配器转写）、observe 阶段自动生成（越带诊断）。对应 v1 缺席的 Plan/Maintain 两端。
- **spec**：需求与设计压缩为一次生成 + 人审。UI 项目保留 v1 的真渲染拍板（lessons #3 是 v1 最贵的教训，不能丢）：spec 的可接受形态包含可点原型。
- **plan**：实现计划工件，列出改哪些文件、顺序、用什么测试证明。对应文章 plan mode 产物；v1 没有这一层（计划散在会话记忆里）。
- **change**：实现 + 自动收敛循环（测试/构建/截图自反馈，机器 checks 不绿不进入审查），然后对抗性审查（reviewer 泛化），最后按风险分层决定是否需要人批合并。v1 的 review-ready 四前置直接映射到这里的收敛出口条件。
- **release**：唯一永远保留 `human` 类型 Gate 的阶段，hook 强制（deploy 动作无审批记录即物理阻断）。
- **observe**：drift-check/live-status/verify-status 升级为周期探测 + bands 分层响应（log / 只读诊断 / 写 intent 开新一轮）。

工件全部落在 `work/<工作包id>/` 目录内，与代码同 repo（meta 仓）版本控制。**这条链本身就是审计轨**：谁要的、agent 产出了什么、谁批的，全在 commit 历史里。

### 3.2 三层架构

```
┌─ 治理层 gates.yaml + hooks ────────────────────────────┐
│   Gate 策略（声明式）· hook 编译 · 分支保护 · 审批工件    │
├─ 执行层 Runner（buildbeat run / watch）────────────────┤
│   工件事件监听 · headless run 调度（每 run 一个 worktree）│
│   置信关卡 · 证据采集 · 升级/通知 · agent 适配器          │
├─ 协议层 工件 schema + 文件约定 ─────────────────────────┤
│   intent/spec/plan/change/release/observe 六 schema     │
│   contracts/ · decisions.md · evals/ · AGENTS.md        │
└─ Git ──────────────────────────────────────────────────┘
```

- **协议层**：六工件的最小 schema（markdown + frontmatter，人和机器都能读写）、契约与决策台账（沿用 v1）、AGENTS.md 装载约定（沿用）。协议层独立完整——没有 Runner 时，人可以手工按协议走完闭环（v1 "Skill-only 完整可用"原则的 v2 版）。
- **执行层（Runner）**：本地进程，两个入口：`buildbeat run <wp> [--stage]`（单步推进）与 `buildbeat watch`（守护监听）。职责：发现"已接受工件"事件 → 按 gates.yaml 判定放行 → 在独立 worktree 里启动 headless agent run（阶段专属 prompt/skill）→ run 结束采集证据 → 过置信关卡 → 继续流转或升级给人。**agent 适配器接口化**（`claude -p`、`cursor-agent`、codex 等各一个薄 adapter），不绑厂商——lessons #15 在 runtime 层的镜像。无服务器、无数据库：Runner 的全部状态就是 git 里的工件与标记文件，进程挂了重启即恢复。
- **治理层**：见 §3.3。

### 3.3 Gate 2.0：声明式策略，三种类型，行动时强制

Gate 不再是四个写死的节拍点，而是 `gates.yaml`（project-owned、版本控制）里的条目：

```yaml
# 示意（schema 在 Phase 0 冻结）
autonomy: standard          # fast | standard | heavy —— v1 三轨映射为自主权预设
gates:
  spec-approval:
    at: intent -> spec      # 守卫哪个流转
    type: human             # machine | agent | human
    applies: [standard, heavy]   # fast 轨此门自动通过
  change-converge:
    at: change -> review
    type: machine           # 确定性：测试绿、构建绿、无 secret、schema 合法
    checks: [tests, build, gitleaks, schema]
  adversarial-review:
    at: review -> merge
    type: agent             # 对抗性审查 agent，rubric 版本控制
    escalate_if: [P0, P1]   # 命中即升级人批
  merge-approval:
    at: review -> merge
    type: human
    applies: [heavy]        # 标准轨机器+agent 绿即自动合并
  release:
    at: merge -> production
    type: human
    enforce: hook           # 编译为 deploy 拦截 hook，无审批记录物理阻断
```

- **machine**：确定性脚本，Runner 直接执行，绿即过。v1 的 bus-check/verify-status 拆解重组进这里。
- **agent**：对抗性审查（v1 reviewer 的泛化），独立上下文、只读、rubric 化；产出 findings 工件。
- **human**：**异步审批工件**——Runner 把待批事项写进 `work/<id>/gate-<name>.pending`，人通过 `buildbeat approve`（写签名决策行 + commit）或直接 merge 对应 PR 完成审批；闭环等的是文件出现，不是人守在聊天窗口。`buildbeat inbox` 列出所有待批项。人批的裁决自动落 decisions.md（v1 决策台账语义保留，录入自动化）。
- **强制手段分三级**：Runner 关卡（不放行就不调度下一 run）→ git hook / 分支保护（拦提交与合并）→ 工具层 hook（Claude Code hooks 等，拦截 deploy 类命令）。哪一级可用取决于项目环境，`gates.yaml` 声明期望，`buildbeat doctor` 报告实际覆盖到哪级、哪些仍靠自觉（fail-closed 传统的延续）。
- 四个旧 Gate 成为 `standard` 预设的默认内容；`fast/heavy` 预设对应 v1 快轨/重轨。项目可增删条目——v1 "禁止自定义 Gate"正式废除。

### 3.4 状态全部派生

废除手写的 `pm/NOW.md`、看板聚合、`pm/status/{视角}.md`。替代物：

- `buildbeat status`：扫 `work/*/` 工件 + git 历史，渲染当前全景（每个工作包在哪个阶段、卡在哪个 Gate、最近证据、待批清单）。要落盘就输出到 `pm/STATUS.generated.md` 并标注生成时间，人和 agent 都只读。
- 决策台账 `decisions.md`、契约 `contracts/` 保留手写——它们是判断的记录，不是可派生的状态。
- lessons #1/5/7/11 的整类问题（腐烂、漂移、膨胀、幽灵 hash）从"被检查器抓"变为"结构上不可能"。

### 3.5 双驱动模式

- **attended**：人开交互会话推进某个阶段（今天的用法），会话读写同一套工件、受同一套 gates.yaml 约束。适合 spec 讨论、复杂排障、存量接管摸底。
- **unattended**：Runner 调度 headless run。适合 plan→change 收敛、observe 诊断、事故首响。
- 两种模式产出的工件不可区分——协议只认工件，不认驱动方式。采用路径由此平滑：先 attended 跑通协议，再逐阶段交给 Runner（文章原话的路径："first, you prompt each step by hand, with the end state being a loop"）。

### 3.6 evals 与度量

- `evals/`：真实任务 + 验收断言。触发时机：AGENTS.md / skills / gates.yaml / 阶段 prompt 变更时全跑；每次生产事故收敛后新增一条永久回归。BuildBeat 自身仓库同样适用（改 SKILL.md 要过 evals）。
- `buildbeat metrics`：本地只读，从 git/工件时间戳计算——intent→spec 时长、spec→merge 时长、首次实现即合并率、返工率、每个 Gate 的等待时长、observe 发现转化为已合并修复的比例。无采集、无上传；"遥测"继续是非目标，但"从自己 git 里读自己的交付事实"不再被错杀。

### 3.7 安全模型（unattended 的前提）

- 每个 headless run：独立 worktree（lessons #12 制度化）、最小工具面（阶段声明所需工具）、无生产凭据（release 永远人批 + hook 强制）、产出一律走分支/PR，无直通 main 路径。
- 凭据红线、gitleaks 闸、`git archive HEAD` 构建纪律原样保留。
- Runner 自身不含模型 Key 管理——调用哪个 agent CLI 用哪家凭据是宿主环境的事，adapter 只传递。

---

## 4. v2 目标文件结构

```text
<项目根>/
├── AGENTS.md                    # 装载入口（沿用，开放标准）
├── ARCHITECTURE.md              # 系统事实（沿用）
├── contracts/PROTOCOL.md        # 跨边界契约 SSOT（沿用）
├── gates.yaml                   # ★ Gate 策略（新）
├── work/                        # ★ 工作包工件链（新，取代 pm/ 大部）
│   └── <wp-id>/
│       ├── intent.md
│       ├── spec.md              # UI 项目含可点原型入口
│       ├── plan.md
│       ├── review-findings.md   # agent Gate 产出
│       ├── gate-*.pending|.approved
│       └── evidence/            # run 自动采集
├── pm/
│   ├── decisions.md             # 拍板台账（沿用，录入自动化）
│   ├── STATUS.generated.md      # 派生视图（只读）
│   └── archive/                 # 归档（沿用）
├── evals/                       # ★ 协议配置回归（新）
├── observe/
│   └── bands.yaml               # ★ 监控分层响应配置（新）
├── scripts/                     # drift-check / live-status 等探测器（沿用重组）
└── BUILDBEAT.md                 # 版本标记（沿用）
```

废除：`pm/NOW.md`、`<期>-看板.md`、`pm/status/`、`pm/changes/`（重轨变更提案由 heavy 轨的 spec+human gate 覆盖）、换期压缩仪式（无手写流水则无需压缩）。

---

## 5. 落地计划

单人维护现实约束下按五个 Phase 推进；每个 Phase 有独立价值与止损点，不押注一次性大爆炸。

### Phase 0 — 核心模型冻结（1–2 周）

| 交付 | 验收 |
|---|---|
| 本提案拍板（Gate：所有者批准替代 ROADMAP.md 方向基线） | decisions.md 落一行 |
| 六工件最小 schema（markdown+frontmatter）定稿 | schema 文档 + 每工件一个填好的样例 |
| `gates.yaml` schema 定稿 + fast/standard/heavy 三预设 | 三份预设文件 + 校验脚本 |
| Runner 技术选型 ADR（建议：Node 20+ 零依赖，复用现有 `src/` 地基；agent adapter 接口定义，首个 adapter 定为日常主力工具） | ADR Accepted |
| v1→v2 概念映射表（哪些概念废除/降级/保留，写给未来迁移文档） | 映射表入库 |

**止损**：schema 阶段发现六工件对 solo 场景过重，允许合并 spec+plan 为一个工件再继续。

### Phase 1 — MVP 闭环：intent 到 merge（2–4 周）

目标：**一个真实小项目上，人只出现两次**（批 spec、批 merge），中间全部自动。

| 工作包 | 内容 | 验收 |
|---|---|---|
| WP1.1 | `buildbeat run <wp> --stage`：单步推进，headless 调用 adapter，独立 worktree，产出工件 | intent→spec→plan→change 四段各自可单步跑通 |
| WP1.2 | machine Gate：tests/build/gitleaks/schema checks 接入 Runner 关卡 | checks 红时流转确定停止 |
| WP1.3 | human Gate 异步审批：`.pending` 工件 + `buildbeat approve` + `inbox` | 审批落 decisions.md，闭环等文件恢复流转 |
| WP1.4 | `buildbeat watch`：监听工件事件自动触发下一步 | 真实项目从 intent.md 提交到 merge 候选，人仅两次介入 |
| WP1.5 | `buildbeat status` 派生视图 v0 | 与手工盘点一致，无手写状态文件 |
| WP1.6 | 真实项目试点（建议从所有者所在企业的 AI 底座里选一个单仓小项目） | 试点记录入库（沿用 v1 的 PILOT 文档传统） |

**止损**：试点显示 loop 开销 > 收益（solo 小项目场景），则 Runner 降级为"半自动"——只做 `run --stage` 单步 + inbox，watch 缓建；协议层成果不受影响。

### Phase 2 — 治理硬化（2–3 周）

| 工作包 | 内容 |
|---|---|
| WP2.1 | agent Gate：reviewer 泛化为 Runner 关卡，rubric 版本控制，findings 工件化，P0/P1 自动升级人批 |
| WP2.2 | hook 编译：gates.yaml → Claude Code hooks / pre-commit / 分支保护建议；`doctor` 报告强制覆盖级别 |
| WP2.3 | change 阶段收敛循环：自反馈（测试/截图）+ 不绿不出来 + 测试文件保护（修 bug 时禁改测试，文章同款） |
| WP2.4 | 自主权分层落地：三预设 × 环境维度；worktree 并行多工作包 |

### Phase 3 — 闭环收口：observe 与 evals（2–3 周）

| 工作包 | 内容 |
|---|---|
| WP3.1 | observe 阶段：drift-check/live-status/verify-status 重组为周期探测器；`observe/bands.yaml` 分层响应（log → 只读诊断 → 写 intent） |
| WP3.2 | 自动 intent 生成：越带诊断按 intent schema 落盘进入队列，人分诊（fix now / schedule / dismiss，dismiss 调 bands） |
| WP3.3 | `evals/` 机制：配置变更触发 + 事故转 eval；先给 BuildBeat 自身仓库用上 |
| WP3.4 | `buildbeat metrics`：git 派生指标 v0（六个指标起步，见 §3.6） |

### Phase 4 — 迁移与发布（1–2 周）

| 工作包 | 内容 |
|---|---|
| WP4.1 | v1 项目迁移指南：v1 协议继续可读可用（不强迁）；`adopt --v2` 受控迁移路径；`pm/` 旧结构 → `work/` 映射工具 |
| WP4.2 | 文档重写：README/SKILL 按 v2 定位；v1 SKILL 冻结为 legacy 入口 |
| WP4.3 | major 版本发布（2.0.0），沿用 Trusted Publishing runbook |

**总量粗估**：8–14 周弹性（单人 + AI 会话；Phase 1 是最大不确定项）。

---

## 6. 风险与止损

| 风险 | 表现 | 缓解 |
|---|---|---|
| Runner 成为第二事实源 | 引擎状态与 git 漂移 | 硬约束：Runner 零私有状态，一切状态 = git 里的工件；进程可随时杀 |
| headless run 成本失控 | token 花费/失败重试堆积 | 每 run 预算上限 + 失败 N 次自动升级人批；metrics 盯成本趋势 |
| 过度自动化侵蚀判断 | 人批 Gate 退化成盖章 | human Gate 的待批工件必须携带 agent findings 摘要与风险声明；审批等待时长入 metrics，反向监控"秒批率" |
| agent adapter 碎片化 | 各家 CLI 语义漂移 | adapter 面积压到最小（起 run、传 prompt、收产出三件事）；lessons #15 判据：任何厂商约定必须可替换 |
| 无人值守安全事故 | 自主 run 越权 | §3.7 全套 + release 永远人批；unattended 默认从 plan→change 一段启用，两端后开 |
| 单人带宽 | 五 Phase 烂尾 | 每 Phase 独立可用、独立止损；Phase 1 后即使全停，也已得到"半自动单步 + 异步审批"的净收益 |
| v1 用户断层 | 拷出项目无路可走 | v1 协议只冻结不删除；迁移永远 opt-in |

## 7. v2 非目标（继续排除）

远程服务/账号体系/多租户；行为遥测采集与上传；团队岗位/审批矩阵建模；模型路由与 Key 管理平台；业务代码生成器。——v1 §16 的排除项中，仅"运行时编排"与"度量"两项解禁，其余维持。

## 8. 历史待拍板决策（已由 V2-PLAN 收口）

| # | 决策变量 | 推荐 | 备选与后果 |
|---|---|---|---|
| D1 | 六工件 vs 五工件（spec+plan 合并） | **六工件**：plan 独立可审是文章验证过的杠杆点（改文档比改 diff 便宜） | 合并则 solo 小任务更轻，但丢失"计划先于代码"的审查面 |
| D2 | Runner 载体 | **扩展现有 `@haiyangbg/buildbeat` CLI**（复用 Node 地基与发布链） | 新仓另起：边界干净但分裂维护面 |
| D3 | 首个 agent adapter | **按你日常主力工具定**（cursor-agent 或 claude -p） | 双 adapter 齐发验证接口普适性，成本 +30% |
| D4 | v1 手写状态废除节奏 | **v2 新项目直接无手写状态**；v1 项目迁移时一步到位 | 过渡期双轨（手写+派生并存）——强烈不建议，等于自造 SSOT 腐烂 |
| D5 | Phase 1 试点项目 | 所有者所在企业的 AI 底座内选一个单仓、有测试、迭代活跃的小项目 | 用 BuildBeat 仓库自举：戏剧性强但元问题（用未验证的引擎改引擎）风险高 |

---

_历史说明：本文曾是未拍板提案；项目所有者已于 2026-08-27 以 `V2-D0=B` 正式采用合并后的 [`V2-PLAN.md`](V2-PLAN.md)。本文自身不再升格或承接执行。_
