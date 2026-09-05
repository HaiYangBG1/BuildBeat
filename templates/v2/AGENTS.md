# AGENTS.md — <项目名> 工作区 · BuildBeat v2 协作契约

> 本文件走开放标准 `AGENTS.md`，被工作区下**任意会话**自动装载（Claude Code / Cursor / Codex / Gemini CLI / Aider / Zed 等均认）。目的：每个会话开工即知道「当前工作在哪 / 我是什么视角 / 读哪 / 写哪 / 该调哪条命令」，不靠人转述上下文。
> **层叠规则**（标准语义）：会话从被编辑文件所在目录向上收集沿途所有 `AGENTS.md` 合并，**离得越近优先级越高**。本文件只写全局的（路由 / 协作规则 / 红线），各代码子仓的局部细节写进**该仓自己的 `AGENTS.md`**。
> 根目录 `CLAUDE.md` 只是一行指针（兼容只认该文件名的工具），内容单点在本文件。全栈总图见 `./ARCHITECTURE.md`，按需读。
> **本仓运行 BuildBeat v2**（运行时 `@haiyangbg/buildbeat@<版本>`，`buildbeat-v2` 由会话调用，人不必手敲）。若由 v1 迁来：`pm/NOW.md`、当期看板、`pm/status/*` 冻结只读，**禁止双写**。

## 0. v2 下工作怎么发生（一页流程）

1. **工作项**：每件事一个 `delivery/work/<WORK-ID>/`（`intent.md` 为什么做 + **止损线**（最多几个 Run / 几轮 review / 几小时，越线先问所有者"继续还是砍"）+ `plan.md` 怎么做，可选 `env-facts.md` 记踩出来的环境事实）；被 digest 绑定接受（`buildbeat-v2 accept`）前只是草稿、不产生义务。`overview` 的 `cost:` 行就是止损线的读数。
2. **代码工作跑 Run**：`buildbeat-v2 start --config <run-config.yaml> --attempt new` → 隔离 worktree 内 Build→Verify→Fix→Review 自动闭环 → **停在合并决定**。push、合并、部署永远是人批之后的人类动作。
3. **人怎么知道该做什么**：`buildbeat-v2 overview --repo .` 回答「每件事走到哪、下一步该谁」；`inbox` 只列等人批的 Run，每条后面附可复制的下一句命令；`status --run <RUN>` 回答「还在动吗、动了多久、卡没卡」。
4. **上线**：生产动作是人的；`release-readback` 预设 + `release` 风险预设把「做之前回读 → 人做 → 做之后回读 → 观察 → 人关窗」记成 L4 证据，任一步失败即停人批。
5. **observe 盯生产**：`buildbeat-v2 observe run --config .buildbeat/observe.yaml` 一次=一轮只读体检；异常分层（落账→只读诊断→intent 草稿入队 `delivery/observe/intents/`），草稿**绝不自动执行**，人用 `observe triage` 分诊。
6. **拍板台账**：平台级真实决策包一行进 `pm/decisions.md`；Run 级批准落各 Work 的 `decisions.jsonl`；finding 裁决落 `review-findings.jsonl`。契约在 `contracts/`。
7. **通知**：`.buildbeat/notify.yaml` 配一条通道（URL 只能来自环境变量），Run 停在人批 / 终态 / 疑似卡住会来找人。
8. **打扫**：终态 Run 留下的工作树用 `buildbeat-v2 gc --repo .` 清（默认只出计划）。工作树在仓内 `.buildbeat/worktrees/`：`.gitignore` 排除 `.buildbeat/runtime/` 与 `.buildbeat/worktrees/`，测试框架的收集范围也要排除 `**/.buildbeat/**`（vitest `exclude`、jest `testPathIgnorePatterns`、pytest `norecursedirs`），否则主干测试会把旧候选的用例一起跑。
9. **worker 环境事实（写进 worker prompt / 信封）**：worker 的沙箱通常**不能监听端口**，需要起服务或绑定 loopback 的集成测试交给 verify 步，worker 只跑单测与静态检查，不要反复尝试；PATH 只认 POSIX 工具（`grep -E` 不用 `rg`，`find` 不用 `fd`）或在 `requires:` 里声明；verify / 包装脚本发现环境不满足（命令不在 PATH、端口被占、后端 404）就 `exit 75`，内核会当基础设施故障停人、不派 fixer、不扣预算。

## 1. 工作包路由 —— Builder 端到端负责，会话按 AI 视角隔离

> 协作单元是需求/功能工作包（= v2 Work）。一个 Builder 对工作包的产品判断、实现、测试、合并与发布证据端到端负责；下表是可调用的 AI 专业视角和文件写边界，不是人类岗位或固定交接流水线。共享事实走 Git（`delivery/` 与 Run 台账）。

| AI 视角 | cwd | 可写（拥有） | 只读 | 开工先读 |
|---|---|---|---|---|
| **产品**（规格/编排） | 工作区根 | `delivery/**`、`pm/decisions.md`、根规划文档、`contracts/**` | 全仓 | `buildbeat-v2 overview --repo .` |
| **全栈**（实现，含运维） | `<代码仓>/` | `<代码仓>/**`（Run 内受 `allowedPaths` 机器约束） | `delivery/*`、契约 | 所属 Work 的 intent/plan + `run-config.yaml` |
| **测试**（契约验证·E2E） | 工作区根 | `tests/**`、独立核验报告（落所属 Work 目录） | 实现 + 规格 + 契约 | 所属 Work + 契约 |

> 🔴 **边界（按项目填写）**：<新地盘 / 老地盘 / 只读模块 / 不得借道写入的目录>。
> 🔴 **写者≠审者的机器化**：v2 Run 内置 fresh-context 只读 reviewer（快照强制，写入即失败落账）；merge 门绑定 candidate + plan + 证据 digest，过期即 stale。
> **开工/收工护栏**：任意会话开工先 `bash scripts/bus-check.sh` + 各仓 `git pull`；收工前再跑 `bus-check --strict` 并保留 warning/unverified 边界。生产状态问 `observe status`，不猜。

## 1.5 UI 规范摘要（非 UI 项目可删）

- 延用既定设计语言与 token；每个可见界面处理加载 / 空 / 错误 / 移动端四态。
- **界面零元注释**：上线的可见界面不得出现给"做的人"看的文字；每次上线核查门必查。
- UI 交付的拍板对象必须含可渲染证据（真渲染入口 + 截图 digest）；静态描述不构成拍板对象。

## 2. 协作规则（v2 版）

**① 唯一入口** —— 活动工作看 `delivery/`（`overview` / `inbox`）；v1 遗留入口 `pm/NOW.md` 只读。
**② 契约落盘不喊话（双向）** —— 跨边界接口先改 `contracts/` 再动代码；收到协议声明独立核查再信。反向流：实现中发现契约不够用 → 不得就地消化，停下记契约缺口交产品域裁决。
**③ 交接靠 candidate hash + 台账** —— Run 停在合并决定时 candidate 已由 Git 回读固定；跨会话接力读 `delivery/work/<id>/` 即知全部事实，hash 不得编造。
**④ 护栏与不可逆动作** —— 开工 `bus-check`；部署/改契约/migration 等不可逆动作前再跑一次并走人批；exit 0 不消除 `warning/unverified`。
**⑤ 风险分轨** —— Risk Preset：`fast`（仅 merge 人批）/ `standard`（plan+merge，默认）/ `controlled`（intent+plan+merge+release）/ `release`（上线回读车道）。
**⑥ 核查门** —— Run 内 reviewer 只读、结构化 findings；`reviewTriage: required` 时 P0/P1 先过人分诊再派 fixer；review 每 Run 默认 2 轮封顶。**完成 = hash + 可核验证据**；标准轨最低 L3，上线必须 L4。`UNVERIFIED` 永不当作通过。
**⑦ 状态单点** —— 事实进 Run 证据与 Work 记录；进度看 `overview`，度量看 `metrics`（本地只读）。
**⑧ 视觉问题带图对比** —— 提 UI bug 必附『实现截图 ⟷ 设计稿截图』并排 + 标注差异点。
**⑨ 单点事实** —— 线上版本只信实查（`bus-check` / `observe status`）；每个收敛后的真实决策包只在 `pm/decisions.md` 记一行；历史台账不回改。
**⑩ 真渲染拍板** —— 有 UI 的拍板对象必须是真渲染证据。
**⑪ 所有者可见命名进决策卡** —— 域名、服务名、环境名、自停时长、窗口时长等**所有者以后要看见或要念出来的名字与参数**，不由 worker 顺手定：进 intent 或门前决策卡（`BATCH_AT_GATE`），给推荐值和理由（用业务上听得懂的名字，不用内部术语）。

## 2.5 任务包与人批节奏

**任务包信封** —— 开工时从用户目标与活动 Work 明确 `objective / in_scope / terminal_condition`（即 Work 的 intent/plan）。默认一个工作包覆盖多个子项；每个会话同时只认领一个。只要仍有安全、可逆、在范围内且能推进目标的工作，会话就继续做，不因子产物完成交还接力棒。

**域回复格式** —— 面向用户收口、交接或回复明确检查点时，统一写「已做 → 未做 → 下一步」；已做/未做默认各总结成一句，不习惯性 1234 分条；只有事项性质差异大时才列举，每条仍是"结果+证据"。

**审批三级**：`STOP_NOW`（跨发布门 / 扩范围 / 改冻结契约 / 不可逆外部动作 / 接受风险）；`BATCH_AT_GATE`（冻结前可逆取舍、默认值、阈值、可见命名——攒到门前一次批 2～5 个）；`NO_APPROVAL`（能实查的事实、派生约束、文档归档、普通 P2）。

**人批预算** —— 每个工作包、每道门默认 1 个 `BATCH_AT_GATE` 请求；待批项必须带 findings 摘要与风险声明。

> **元原则：能实查的不问人** —— 查代码 / 配置 / 部署平台 / `overview` / `status` / `observe status` 能得到的事实，不拿去问用户、不信文档、不信上游转述。

## 3. 红线（每个会话受约束）

1. **凭据不入 git、不出本机**：文档只标位置不写值；本地 .env gitignore + 600；机器闸 = gitleaks pre-commit；v2 Worker 默认 env 白名单；通知 URL 只能来自环境变量。
2. **不 `git add -A`**：只 stage 当前工作包拥有的具体文件；各仓分别提交。
3. **不未授权部署**、不 force-push、不 `--amend` 已推送历史、不 `--no-verify`。Run 批准仅表示 merge-ready，合并/push/发布是其后的人类动作、逐项授权。
4. **每次部署完必更对应仓 `CHANGELOG.md`**；部署后 `observe run` 一轮。
5. **写者≠审者**：Run 内置只读 reviewer 机器强制；写者转述不构成证据。
6. **事实分层**：代码已确认事实 / 运行时待核事实 / 拟议需求 / 已实现行为，四类严格分开；未实查一律写「待核」。
