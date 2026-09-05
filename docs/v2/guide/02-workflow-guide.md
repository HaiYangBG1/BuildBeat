# Workflow 编写指南

权威：[`RFC-0003 §2`](../RFC-0003-workflow-policy.md)；实现：`src/v2/engine/workflow.js`。官方预设 [`software-delivery.yaml`](../../../src/v2/presets/software-delivery.yaml) 是最好的范本。

## 形状

```yaml
kind: workflow
version: 1
name: software-delivery
entry: intent
steps:
  - id: build
    worker: builder
  - id: review
    worker: reviewer
    readonly: true
  - id: wait-merge
transitions:
  - from: verify
    on: failed
    to: fix
terminal:
  - wait-merge
```

## 规则（加载期 fail-closed 校验）

1. **步序即默认边**：`steps` 的书写顺序定义 happy path——每步 `succeeded` 默认走向下一步；不想进默认链的步（如 `fix`）放在末尾、只经显式转换进入。
2. **显式转换**：`transitions` 的 `on` 取 worker 结果（`succeeded` / `failed` / `findings-blocking`）；显式边优先于默认边。
3. **`readonly: true`**：该步 Worker 的任何工作树写入都会让步骤按失败处理并落账——Reviewer 不改代码是不变量 9，靠 Runner 的前后快照比对强制，不靠 prompt 自觉。
4. **`optional` / `requiredWhen`**：可选步默认跳过；`requiredWhen: ui-delivery` 在 UI 交付时强制（配合 [ui-render-gate](03-policy-guide.md) 与不变量 22）。
5. **`terminal`**：列出的步是出口。加载器做**无出口环检测**——verify⇄fix 这类环必须存在能到 terminal 的路径，否则拒绝加载。
6. **无 worker 的步**（如 `wait-merge`）是纯等待/决定点，Runner 在这里产生 `HUMAN_REQUESTED` 或按 `stopAt` 停下。

## 与 run 配置的关系

run 配置里 `entry` 可覆盖 workflow 的 `entry`（例如从 `build` 起步、跳过 intent/plan 步——digest 仍会绑进批准对象）；`stopAt` 指定停点。workflow 文件整体做 sha256 → `RUN_CREATED.workflowDigest`，事后可证明当时跑的是哪份流程。

run 配置还可声明（beta.3，皆来自三十轮部署战役的真实事故）：

- **`requires:` 环境契约**——信封隐式依赖的二进制与最低版本，Run 启动前 fail-closed 全量核验，一次报清所有问题（真实事故：`rg` 只在某会话 vendored PATH、`/bin/bash` 3.2、新 shell 解析到 Node 14，各烧掉整轮 Run 才见真因）：

  ```yaml
  requires:
    - command: bash
      min: 4
    - command: rg
  ```

- **`reviewTriage: required` 发现分诊门**——review 的阻断性 finding 先停人分诊、再派 fixer（见 [Approval 指南](07-approval-guide.md)）。

## review 轮数预算

官方预设自带 `budgets.maxAttempts.review: 2`（战役章程"每 Run 2 轮 review 封顶"的原生化）：第三轮 review 在启动前即停 `WAITING_HUMAN`，理由写明预算耗尽。机制就是每步 `maxAttempts`，无需新概念。

预算耗尽后停的那次 `resume-<step>`，**人批准即多给一次**：内核落一条 `BUDGET_EXTENDED`（台账事实，可重放），该步上限 +1 再跑；拒绝即终止 Run。此前批准只会让同一请求立刻回来（试点两条应用登录 Run 因此以 CANCELLED 收场，候选却已在生产）。

run 配置可覆盖预设（run 配置 > 预设 > 全局 `maxAttemptsPerStep`）：

```yaml
budgets:
  maxAttempts:
    review: 3
    verify: 6
  reviewRoundsPerWork: 6   # 跨本 Work 所有 Run（含已作废）累计的 review 轮数上限，见 overview 指南
```

`doctor` 打印每步生效的上限与来源（run config / workflow preset / default）。

**按 Work 累计的 review 轮数（迭代 09）**：每 Run 的预算挡不住"每轮一个新 Run"——试点一个 Work 跑了 21 个 Run、9 轮 review，2 轮封顶从未触发。`budgets.reviewRoundsPerWork: N` 让内核在 review 步起跑前统计本 Work **所有** Run（含已作废、含已压成 run-record 的）的 review 轮数，达到 N 即停 `WAITING_HUMAN`（kind `work-review-cap`，transition `enter-review`）：批准即再审一轮（台账 `BUDGET_EXTENDED scope=work`），拒绝则按手头证据合并或关闭。`overview` 每个 Work 多一行 `cost: review rounds · findings · human waits · worker 时长`，run-record 也带 `cost` 块——"继续还是砍"之前先看这一行；intent 里的止损线（最多几个 Run / 几轮 review / 几小时）就对着它核。

## 工作树在仓内：把 `.buildbeat/` 排除出测试收集（迭代 09）

Run 的隔离工作树在 `<repo>/.buildbeat/worktrees/<RUN>/`，运行时台账在 `<repo>/.buildbeat/runtime/`。两者都不入 git（模板 `.gitignore` 已排除；尊重 `.gitignore` 的工具如 `rg`、`gitleaks` 随之不再走进去），但**测试框架按文件系统收集用例**：试点合并后的主干 vitest 把残留工作树里旧候选的用例一起跑了，噪声直到 `gc` 才消失。在项目里加：

- vitest：`test.exclude: ['**/node_modules/**', '**/.buildbeat/**']`
- jest：`testPathIgnorePatterns: ['/node_modules/', '/.buildbeat/']`
- pytest：`norecursedirs = .buildbeat`
- Maven / Gradle 只收集 `src/**`，不受影响；Playwright 的 `testDir` 指到具体目录即可。

`start` 被「another run is active」挡住时，CLI 现在打印持锁的 Run、它在哪一步、最后一次事件多久前，以及可复制的 `status` 命令；仓级单活动 Run 锁本身没放开——工作树已隔离，锁只剩台账与合并安全的意义，等真出现第二次多小时排队再动。

## 基础设施故障与候选缺陷分开算（迭代 09）

worker 的超时、崩溃、非信封输出，以及 worker 主动以退出码 **75** 结束（约定：verify / 包装脚本发现环境不满足——命令不在 PATH、端口被占、后端 404、沙箱禁止监听——就 `exit 75`），内核一律判 `infra`：`STEP_FINISHED.data.infra = true`，不记失败指纹、不派 fixer、该步预算不扣（`steps[step].infraAttempts` 抵回），停 `WAITING_HUMAN`（kind `infra`）。人批准 `resume-<step>` 重跑，拒绝结束。其余非零退出仍是候选失败，走 `on: failed` 边。

没有转移边的失败结果（预设里 build、review、fix 的 `failed`）也不再终态，停 `resume-<step>` 交人决定。终态 FAILED 只剩 policy `BLOCK`。

## 迭代 08 新增的 run 配置段

- **`envelope:`** —— `prompts:`（目录，相对 run 配置）+ `vars:`（`{vars.x}` 替换）+ 可选 `pin: <sha>`（从该提交读 prompt，冻结信封）。内核按 `<component>-<worker>.md` → `<worker>.md` 取 prompt，落到 `runs/<RUN>/prompts/<step>-<n>.md`，以 `BUILDBEAT_PROMPT`（路径）和 `input.envelope`（`promptRef / file / digest / vars`）交给 worker；worker args 里可用 `{prompt}` 与 `{vars.x}`。`RUN_CREATED` 记 `envelopeDigest`。
- **`start --attempt new`** —— `run:` 写家族名（`RUN-X`），内核编成 `RUN-X-01/02…`（扫运行时面与 Git 面 run-record，删 runtime 也不撞号）；同 Work 旧的等待自动作废（[Approval 指南](07-approval-guide.md)）。
- **`cache:`** —— `verify: tree`：同 `HEAD^{tree}` + 同 worker 命令 + 同信封 digest 且**已通过**的 verify 复用证据（台账 `reused`，status 标 `(reused from RUN-X)`）；失败、脏树不复用。verifier 依赖树外事物（远端、时间）的项目不要开。
- **增量审查** —— readonly 步的 input 带 `lastReviewed {candidate, run, evidenceRef, range}`（同 Work 最近一次 review 的候选且为当前候选祖先）；reviewer prompt 可要求只审 `range` 内 diff，锚定裁决照旧（`anchor`）。
- **`redact:`** —— 正则列表，证据日志落盘前替换为 `<REDACTED>`；digest 绑脱敏后文本。实时流（`.live`）不脱敏、步结束即删。
- **`requires:` 的 `probe:` 条目** —— `probe: <shell 命令>` + 可选 `expect: <正则>` + `name:`；退出码非 0 或输出不匹配即 fail-closed，与二进制版本项一次报清。把踩出来的环境事实（Redis ≥ 7、目标机 Python 版本、端口可达）写成 probe，下窗不重踩；叙述性事实放 `delivery/work/<ID>/env-facts.md`。
- **step `grade:`** —— workflow 步骤可声明该步命令证据的等级（L0–L4，默认 L2）。

## 上线回读车道：`release-readback` + `riskPreset: release`

内核没有部署能力（不变量 20），生产动作永远是人的。这条车道只把动作前后的**回读**记成 L4 台账：`preflight`（动作前只读检查）→ 停 `enter-apply-readback`（人做动作）→ `apply-readback`（证明动作生效）→ `observe`（证明健康）→ `wait-close`（人关窗）。三个回读步全部 `readonly`、`grade: L4`、`maxAttempts 1`：任一步失败即停人批，没有 fix 边。风险预设 `release` 提供 `stopAt: apply-readback` 与关窗证据门（L4 命令证据）。worker 是任意回读脚本（curl 健康、读版本、比对配置指纹），退出码就是结论。试点项目上线那天的四十条手工 readback 提交，就是这条车道该做的事。

## 修改纪律

预设是产品的一部分：改 `software-delivery.yaml` 前先想清是不是项目差异——项目差异用自己的 workflow 文件（run 配置 `workflow:` 指过去），不改官方预设。schema additive-only，破坏性改法升 `version`。
