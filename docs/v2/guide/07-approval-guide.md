# Human Approval 指南

权威：[`RFC-0003 §5`](../RFC-0003-workflow-policy.md)；实现：`src/v2/runtime/decisions.js`。原则：**人批的是一个 digest 绑定的对象，不是一句"可以了"**。

## 批准绑定什么

一次批准 = `transition + candidate + planDigest + evidenceDigest` 四元组。其中任何一项事后变化，批准自动 `APPROVAL_STALE`，Run 回到 `WAITING_HUMAN`——旧章不能盖新对象（stale 复用 0 是退出指标，试点实测 0）。

## 日常操作

```bash
buildbeat-v2 inbox --repo .                 # 所有等人的 Run：transition、candidate、digest、理由
buildbeat-v2 status --repo . --run RUN-X    # 单个 Run 的完整派生视图（步、证据、findings）
buildbeat-v2 approve --repo . --run RUN-X --transition enter-wait-merge --by <名字> --config <run-config>
buildbeat-v2 reject  --repo . --run RUN-X --reason "<为什么>" --by <名字>
buildbeat-v2 accept  --repo . --work WORK-X --artifact plan --by <名字>   # 工件接受（digest 绑定）
```

决定落 Git 面 `delivery/work/<id>/decisions.jsonl`，事件台账同步记 `DECISION_RECORDED`。

## approve 的安全语义（都有测试）

1. **transition 必须匹配**当前待批项；
2. **盖章前重读实况**：待批快照与实况不一致（候选又动了、计划改了）→ 拒绝并要求刷新，不落章；
3. **transition 门在盖章瞬间 re-check**：merge-evidence-floor / ui-render-gate 等此刻不 PASS → 拒绝；
4. 终局决定（final-decision 类待批）批准即 `RUN_TERMINAL SUCCEEDED` + 压实 run-record 进 Git 面。

## 批准 ≠ 执行

merge 批准只表示 **merge-ready**：真正的合并、push、发布是你在 Runner 之外的动作（保护动作见 [安全边界](09-security-boundaries.md)）。同理 observe 草稿的 `fix_now` 只是接受，Run 由人发起。

## 人批点由 Risk Preset 决定

`fast` 仅 Merge；`standard` Plan+Merge；`controlled` Intent+Plan+Merge+Release；`legacy-four-gates` 为 v1 四 Gate 完整形态（迁移期用，见 [迁移指南](08-migration-v1.md)）。待批项强制携带 findings 摘要与理由——防"秒批"退化；人批等待时长进 `metrics`。

## 发现分诊门与锚定审查（beta.3）

来自三十轮部署战役最大的结构性教训：**finding 是处方不是事实**，无记忆 fresh reviewer 会开出互斥处方并翻案早已接受的设计，自动路由 fixer 让振荡直接烧钱。两个机制配套：

1. **分诊门**：run 配置 `reviewTriage: required` 后，review 产出 P0/P1 finding 不再自动派 fixer，而是停 `WAITING_HUMAN`（kind `finding-triage`），待批理由逐条列出 finding 指纹。人先裁决、再 `approve --transition enter-fix` 放行（或 `reject` 终止 Run）。
2. **裁决台账**：finding 全部落 Git 面 `delivery/work/<id>/review-findings.jsonl`（指纹 = 严重度+正文规范化 hash）：

   ```bash
   buildbeat-v2 findings list --repo . --work WORK-X
   buildbeat-v2 findings adjudicate --repo . --work WORK-X --fingerprint <fp> --action dismiss --by <名字> --note "<为什么>"
   ```

   `dismiss` 后同指纹不再阻断（重提会以 `RE-RAISED` 记账可见，但不重启循环）；**严重度升级=新指纹，自动重新阻断**——压噪不压真信号，与 observe 的 dismiss 回调同一原则。
3. **锚定注入**：Reviewer（readonly 步）的 `BUILDBEAT_INPUT` 带 `anchor`（历史 finding+裁决全表），信封 prompt 应告知 reviewer"已裁决的结论不得翻案"；fixer 等写入步的 input 带 `findings`（上一轮 review 的 finding 及其裁决状态）——fixer 只修 accepted/open，不猜。

裁决记忆在 Git 面，删 runtime 不丢（不变量 23 同款测试覆盖）。

## 等待要能找到人（迭代 08）

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

## 从「等我批」到「到哪了」：overview（迭代 08）

`inbox` 只知道哪个 Run 在等人；`buildbeat-v2 overview --repo .` 按 Work 回答「走到哪、下一步该谁」——intent/plan 是否被接受（接受后改过即 `stale`）、最新 Run 状态与候选、候选是否已合入当前分支、未裁决 P0/P1 数、是否有 `env-facts.md`，每行附下一句命令。运行时被删后由 Git 面 run-record 补足。会话开场先跑它，再回答用户「当前进度」。

## 可见命名是门前决策项（迭代 08）

审批三级里 `BATCH_AT_GATE` 明确包含：域名、服务名、环境名、自停时长、窗口时长等**所有者以后要看见或念出来的名字与参数**。worker 顺手定的名字进不了台账；planner 在 intent 里列出并给推荐值，人一次批。
