# Human Approval 指南

**简体中文** | [English](07-approval-guide.en.md)

权威：[`RFC-0003 §5`](../RFC-0003-workflow-policy.md)；实现：`src/v2/runtime/decisions.js`。原则：**人批的是一个 digest 绑定的对象，不是一句"可以了"**。

## 批准绑定什么

一次批准 = `transition + candidate + planDigest + evidenceDigest` 四元组。其中任何一项事后变化，批准自动 `APPROVAL_STALE`，Run 回到 `WAITING_HUMAN`——旧章不能盖新对象（stale 复用 0 是退出指标，试点实测 0）。

## 日常操作

```bash
buildbeat inbox --repo .                 # 所有等人的 Run：transition、candidate、digest、理由
buildbeat status --repo . --run RUN-X    # 单个 Run 的完整派生视图（步、证据、findings）
buildbeat approve --repo . --run RUN-X --transition enter-wait-merge --by <名字> --config <run-config>
buildbeat reject  --repo . --run RUN-X --reason "<为什么>" --by <名字>
buildbeat accept  --repo . --work WORK-X --artifact plan --by <名字>   # 工件接受（digest 绑定）
```

决定落 Git 面 `delivery/work/<id>/decisions.jsonl`，事件台账同步记 `DECISION_RECORDED`。

## approve 的安全语义（都有测试）

1. **transition 必须匹配**当前待批项；
2. **盖章前重读实况**：待批快照与实况不一致（候选又动了、计划改了）→ 拒绝并要求刷新，不落章；
3. **transition 门在盖章瞬间 re-check**：merge-evidence-floor / ui-render-gate 等此刻不 PASS → 拒绝；
4. 终局决定（final-decision 类待批）批准即 `RUN_TERMINAL SUCCEEDED` + 压实 run-record 进 Git 面。

## 五个词各指什么（批准 ≠ 执行）

会话与文档里"接受 / 批准 / 恢复 / 成功 / 合并"混用过，统一如下：

| 词 | 命令 | 含义 | 不等于 |
|---|---|---|---|
| **接受**（accept） | `accept --artifact intent\|plan`，或 `--artifact intent,plan` 一次接受两份 | 每份工件的 digest 各自被人认可、各记一行；改过哪份哪份 `stale` | 开工；不产生任何 Run |
| **批准某转换**（approve） | `approve --transition <t>` | 允许 Run 走**这一条** transition：`enter-fix`（分诊后或 review 不收敛时放行 fixer；附带 grants 时还放行重验后的下一轮 review）、`resume-<step>`（预算耗尽后扩额，或 infra 退款后重试）、`enter-review`（Work 级 review 上限后再审一轮）、`enter-apply-readback`（上线车道"我做完了"） | 批准了别的转换；非终态转换批准后 Run **不会自己动**，要 `resume --config <run-config>` 续跑（`approve` 输出的 `next:` 行会写明） |
| **合并决定**（最终批准） | `approve --transition enter-wait-merge` | 候选已具备合并条件：candidate + planDigest + evidenceDigest 此刻全部成立；Run 进终态 `SUCCEEDED`，run-record 压进 Git 面 | 代码已合并、已 push、已部署——这三件永远是你在 Runner 之外的动作 |
| **Run SUCCEEDED** | — | Run 停在了它该停的地方，证据齐 | Work 完成。`overview` 只有回读到候选在当前分支上才显示 `MERGED` |
| **拒绝**（reject） | `reject --reason` | Run 终止（`FAILED`，理由入账） | 工件失效；intent/plan 的接受状态不变 |

同理 observe 草稿的 `fix_now` 只是接受，Run 由人发起。保护动作见 [安全边界](09-security-boundaries.md)。

使用 `start --attempt new` 自动编号时，`resume --config <run-config.yaml>` 会续跑该家族唯一未终态的 Run，并打印选中的 ID；也可用 `--run <RUN-ID>` 显式指定配置中的 Run 本身或 `<家族>-NN`（数字至少两位）。配置本身已有台账时优先使用该精确 ID。多个未终态 Run 会列出候选并要求用 `--run` 选择；没有未终态 Run 会报告最新一次的 ID 和终态，没有台账则明确说明。

## 人批点由 Risk Preset 决定

`fast` 仅 Merge；`standard` Plan+Merge；`controlled` Intent+Plan+Merge+Release。待批项强制携带 findings 摘要与理由——防"秒批"退化；人批等待时长进 `metrics`。

## 预算停车：成功不扣次数，一轮一问

- 非只读步（build / verify / fix）成功的 attempt 不扣 `maxAttempts`，只读步仍消耗次数，review 按轮计费。`STEP_FINISHED.free: true` 与 `BUDGET_CONSUMED.amount: 0` 记录退款；没有新字段的旧台账保持原有回放结果。
- 真失败到顶仍停 `resume-<step>`，同指纹两次仍停，release 预设的 `maxAttempts: 1` 仍有效。infra 故障仍不扣次数。review 轮数只受 Work 级 `reviewRoundsPerWork`（默认 6）约束，只作兜底。
- review 发现阻断问题时，若下一轮会超过 Run 或 Work 上限，立即停 `enter-fix`，在花费修复、重验之前问一次。有分诊时 kind 为 `finding-triage`，无分诊时为 `budget`。批准表示「修复 + 重新验证 + 再审一轮」；拒绝结束本 Run，由人按现有证据决定是否合并。
- 上限之内只在 review 不收敛时停 `enter-fix`：本轮有 finding 在修过之后又出现（同指纹，已 dismiss 的不算），或本轮阻断数多于上一轮。kind 为 `review-not-converging`（有分诊时仍是 `finding-triage`，理由里多一条不收敛），请求不带 grants，批准不动预算。阻断 finding 都是新的、数量不多于上一轮时自动继续。见 [Workflow 指南](02-workflow-guide.md) 的「按收敛止损」。
- 每一次预算停车（`enter-fix`、`resume-<step>`、Work 级 `enter-review`）都在请求上记可选 `grants`，列出下一次执行会撞到的 Run/Work 上限；批准一次即同时放行两层，不再连问两次。`resume` 校验批准仍有效后逐条落 `BUDGET_EXTENDED`，并把整份放行计划钉在第一条上：放行落到一半进程被杀，再次 `resume` 按钉住的计划补齐剩余项，不从已被抬高的状态重算。过期批准、新请求不继承旧 grants。会话在 worktree 里手修并用 `resume --adopt <sha>` 回答该请求时，候选虽换成新提交，仍继承请求上的 grants（grants 属于这一轮，不属于某个候选；计划变了则不继承），修完重验后直接进入下一轮 review，不再二次停车。
- 防止自定义 workflow 的成功循环失控：同一步总 attempt 达到有效上限（配置预算 + 人批扩额）的 **3 倍**后，在下一次执行前仍以 kind `budget` 兜底停人。成功/infra 退款不增加兜底上限；批准扩额会提高它。

停车首行显示已用次数（或 review 轮数）、有效上限与真失败次数，并保留 `budget` 标识供度量使用。`status` 的 attempt 序号和 `overview` 的成本累计仍表示实际运行量，不是失败次数；`doctor` 展示配置上限。

## 发现分诊门与锚定审查

> 自 2.0.0-beta.3（beta.3）起。
来自三十轮部署战役最大的结构性教训：**finding 是处方不是事实**，无记忆 fresh reviewer 会开出互斥处方并翻案早已接受的设计，自动路由 fixer 让振荡直接烧钱。两个机制配套：

1. **分诊门**：run 配置 `reviewTriage: required` 后，review 产出 P0/P1 finding 不再自动派 fixer，而是停 `WAITING_HUMAN`（kind `finding-triage`），待批理由逐条列出 finding 指纹。人先裁决、再 `approve --transition enter-fix` 放行（或 `reject` 终止 Run）。
2. **裁决台账**：finding 全部落 Git 面 `delivery/work/<id>/review-findings.jsonl`（指纹 = 严重度+正文规范化 hash）：

   ```bash
   buildbeat findings list --repo . --work WORK-X
   buildbeat findings adjudicate --repo . --work WORK-X --fingerprint <fp> --action dismiss --by <名字> --note "<为什么>"
   ```

   `dismiss` 后同指纹不再阻断（重提会以 `RE-RAISED` 记账可见，但不重启循环）；**严重度升级=新指纹，自动重新阻断**——压噪不压真信号，与 observe 的 dismiss 回调同一原则。
3. **锚定注入**：Reviewer（readonly 步）的 `BUILDBEAT_INPUT` 带 `anchor`（历史 finding+裁决全表），信封 prompt 应告知 reviewer"已裁决的结论不得翻案"；fixer 等写入步的 input 带 `findings`（上一轮 review 的 finding 及其裁决状态）——fixer 只修 accepted/open，不猜。

裁决记忆在 Git 面，删 runtime 不丢（不变量 23 同款测试覆盖）。

## 等待要能找到人

> 自 2.0.0-beta.4（迭代 08）起。
试点工作区 58 个 Run 里 32 个被取消，多数是在 `WAITING_HUMAN` 挂满一天后批量清掉；人批平均等 7～12 小时。原因不是人慢，是**没人知道有东西等他**。三件事配套：

1. **下一句该说什么**：`status` 与 `inbox` 在每个等待后面直接给出可复制的命令（`approve` / `reject`，分诊时加 `findings list|adjudicate`）；`inbox` 按 Work 分组并显示已等待时长。输出里的 `--repo` 只在项目内给相对路径，项目外给 `<repo-path>` 占位——本机绝对路径永不进输出。
2. **同 Work 新 Run 取代旧等待**：`start` 时同一 Work 下仍在等待的旧 Run 记 `SUPERSEDED`（终态、压成 run-record），新 Run 的 `RUN_CREATED.data.supersedes` 记血统；inbox 只剩活的等待。不想要这个行为就在 run 配置写 `supersede: off`。RUNNING 的 Run 不受影响（active 锁），被别的进程锁住的旧 Run 跳过并明示。
3. **通知出站**：Git 面 `.buildbeat/notify.yaml`：

   ```yaml
   kind: notify
   version: 1
   channels:
     - id: owner
       type: dingtalk          # 或 webhook
       urlEnv: BUILDBEAT_NOTIFY_URL   # URL 只能来自环境变量；写 url 直接拒绝
       events:
         - HUMAN_REQUESTED
         - RUN_TERMINAL
         - STALLED
   ```

   Run 停在人批或到终态时由 CLI 出站；订阅 `STALLED` 时 `start`/`resume` 会派一个脱离的 `watch` 进程盯 worker 输出静默（阈值 `stallAfterMs`，默认 15 分钟）。发送失败只记 `runs/<RUN>/notify.log` 与屏幕，**永不影响 Run**；载荷只有标识、原因、候选 SHA 与下一句命令，零日志零候选内容。钉钉自定义机器人需配置关键词（默认 `BuildBeat`）。`doctor` 报告通道与环境变量是否就位。

通知不是审批通道：拍板仍只能在 CLI 完成，digest 绑定不变。

## 从「等我批」到「到哪了」：overview

> 自 2.0.0-beta.4（迭代 08）起。
`inbox` 只知道哪个 Run 在等人；`buildbeat overview --repo .` 按 Work 回答「走到哪、下一步该谁」——intent/plan 是否被接受（接受后改过即 `stale`）、最新 Run 状态与候选、候选是否已合入当前分支、未裁决 P0/P1 数、是否有 `env-facts.md`，每行附下一句命令。运行时被删后由 Git 面 run-record 补足。会话开场先跑它，再回答用户「当前进度」。

**阶段判定的真相修正（迭代 09）**：候选只要合入了当前分支，Work 就是 `MERGED`，哪怕最新 Run 是 CANCELLED（试点一条应用登录 Run 因预算问题被取消，候选却已在生产，overview 曾报 `STOPPED_CANCELLED` 并催重试）；`release-readback` 车道成功关窗的 Work 显示 `RELEASED`，不再说 "nothing to merge"；已合并 / 已发布 / 已关闭的 Work 不再提示未裁决 finding 数。`overview` 每个 Work 还多一行 `cost:`（见 [Workflow 指南](02-workflow-guide.md) 的 Work 级预算）。

## 你自己改好了：`resume --adopt`

> 自 2.0.0-beta.5（迭代 09）起。
Run 停在 `enter-fix` / `resume-fix` 时，驾驶会话或人常常已经在 Run 的 worktree 里把问题修掉并提交了。此时再 `approve` 会派一个无事可做的 fixer，再多跑一次 verify（试点一条前端 Run 因此跑到 verify 第 5 次、fix 第 3 次）。改用：

```bash
buildbeat resume --config <run-config.yaml> --run <RUN-ID> --adopt <sha> --by <名字>
```

内核回读 worktree：树必须干净、HEAD 必须就是 `<sha>`（前缀 7 位起），否则拒绝；然后以人为 actor 落 `CANDIDATE_PINNED`（`adopted: true`）、以该提交为 subject 记 `DECISION_RECORDED`（`adopted`、`resumeAt`），并从 verify 继续（预设里 fix 成功后的下一步）。台账里看得出这一版候选是谁供的。合并决定处不接受 adopt。

`doctor` 现在还打印本仓 `delivery/work/<ID>/` 里 intent / plan 的存在与接受状态，并对每条要求 `artifact.accepted` 的 policy 预告"start 会停在哪一步"——此前两次 doctor 通过、start 却被"plan 未镜像到子仓"挡住。

## 可见命名是门前决策项

> 自 2.0.0-beta.4（迭代 08）起。
审批三级里 `BATCH_AT_GATE` 明确包含：域名、服务名、环境名、自停时长、窗口时长等**所有者以后要看见或念出来的名字与参数**。worker 顺手定的名字进不了台账；planner 在 intent 里列出并给推荐值，人一次批。
