# 工作确认与决策

[English](07-approval-guide.en.md)

新工作只有一份 work.md。accept 绑定文件当前摘要，不会自动开工；用户授权继续后 run 推进。旧 intent/plan/spec 接受记录兼容读取。

status 的决定卡包含 transition、候选、计划摘要、证据、原因和下一步。decide --action approve|reject 必须指向该 Run 与转换。批准前重新回读候选与冻结校验；变化、脏树、缺证据或不合格审查不能盖章。非终态批准后用 run 续跑，最终批准只表示具备合并条件。

合并决定点的 `run --adopt`、`decide --action fix` 与批准命令的 `--candidate` 候选绑定要求运行时 4.2 或更高版本。

合并决定点（`enter-wait-merge`）发现问题时，可以在本 Run 中修复并重新验证、审查：

- 手工修复：在 Run 工作树提交后执行 `buildbeat run --config <config> --run <RUN> --adopt <sha> --by <name>`。工作树必须干净，SHA 必须是实际 HEAD，并且是当前候选的新后代；改动仍受 `allowedPaths` 约束。从 verify 继续，review 使用上一候选的增量范围，最后再次等待合并决定。
- 退回 fixer：执行 `buildbeat decide --repo <repo> --run <RUN> --action fix --reason <要修什么> --by <name>`，再用 `buildbeat run --config <config> --run <RUN>` 续跑。仅合并决定点可用，且配置必须有 fixer；否则先手修再接纳。原因记为本 Work 已接受的 P1 问题，fixer 收到完整原因。

任一修复路径回到合并决定后，先读 `buildbeat status --repo <repo> --run <RUN>`，复制刷新后的批准命令：`buildbeat decide --repo <repo> --run <RUN> --action approve --transition enter-wait-merge --candidate <卡片中的完整 SHA> --by <name>`。状态卡、待批列表和通知会填好候选；旧候选命令或修复后未携带候选的命令会报 `approval stale`，需要重新读取卡片再决定。

修复决定回答旧请求，保留历史证据；合并检查只使用当前候选的证据。退回本身不计 review、不扩额也不退款，后续 review 照常累计。已批准的 SUCCEEDED Run 不重新打开；3.x 活动 Run 仍由原运行时处理。

审查问题通过 decide --action accept|dismiss --work ... --fingerprint ... 裁决。精确指纹的驳回持续生效；换说法的相似性只用于停止不收敛循环，不代替人的裁决。

正常修复自动继续；重复问题、阻断数增加、环境故障或预算耗尽才形成例外决定。预算批准一次放行对应修复、重验和再审；扩额记录可以重放，驾驶会话不能自行冒充用户批准。

合并和上线仍由人完成。上线后运行 `buildbeat release --config <config> [--note <text>]`：它确认该 Work 已成功 Run 的候选包含在 `--ref`（默认当前 HEAD）中，在主检出执行 run-config `release:` 段配置的只读回读命令（形状、环境白名单与脱敏同 worker），把结果、退出码、提交、输出摘要和末尾若干行追加到 `delivery/work/<ID>/releases.jsonl`。

每项工作都以一页结果收口。照 `templates/v2/result.example.md` 写 `delivery/work/<ID>/result.md`：做成了什么、在哪个提交和版本，定了什么，剩下什么、转去了哪里，写进了项目哪些文档。以后还用得上的结论先写进项目自己的文档并提交，再在 result.md 里每条写成 `- <路径> @ <提交> — <写了什么>`。然后用 `decide --repo . --work <ID> --action close [--result <text>] [--note <text>]` 关窗：

- 设了上线回读的工作（run 配置有 `release:`、已经跑过回读，或者配置读不了），最近一次回读必须通过，关窗决定同时绑定这次回读；回读失败不能关窗。其他工作有了 result.md 就能关。工作还有 Run 在运行或等待决定时，不能关窗。
- run 配置放在主仓、工作记录在代码仓时，从主仓执行关窗（`--repo` 指向代码仓）：运行时会读主仓里 `repo:` 指向这个代码仓的配置，代码仓就在主仓目录里时，从代码仓执行也读得到。哪里都读不到配置、代码仓里又有运行记录时，拒绝关窗。
- 运行时把 result.md 的 SHA-256 记为 `resultDigest`。不写 `--result` 时，摘要取 result.md 里第一行既非空、也不是标题的文字（跳过代码块和 HTML 注释）。
- 每条写回行都要核对：提交已经在主检出当前所在的分支上（与 status 判断"已合并"用同一个分支）、确实改了这个文件、文件不在本工作自己的目录里。有一条不成立就拒绝关窗，并一次列出全部问题；全部通过的记为 `promotions`。一条都没写就记为空列表。
- `status --work <ID>` 随时现场核对写回行（✓/✗），关窗前就能先看；关窗后 result.md 又改过，status 会标出 `result.md changed after closing`。

run 配置都没有 `release:` 段的 Work，合并后 status 提示写 result.md 收口。

每条决定都记下是谁、以什么身份做的：`--by` 写名字，`--as human|agent` 写是人还是 AI 会话。不写 `--as` 时看执行环境：在 AI 编程工具里执行（识别 `CLAUDECODE`、`AI_AGENT`、`CODEX_SANDBOX` / `CODEX_THREAD_ID`；其他工具可设 `BUILDBEAT_ACTOR=agent`）记为 AI 会话，名字默认是工具名；否则记为人，名字默认取 `git config user.name`，取不到就要求写 `--by`。AI 会话转达你在对话里说的决定时用 `--as human --by <你的名字>`，记录会注明"经 AI 会话录入"。`status --work <ID>` 列出每条决定（含问题的接受、驳回）和身份，`status --run <RUN>` 列出该 Run 的决定；最近一次合并批准来自 AI 会话时，status 会单独标出。旧记录没有身份字段，显示"身份未记录"，不按名字猜。接受工作说明和关窗时可以加 `--note <text>`，记下人的原话或理由，`status --work` 的决定列表会把它显示在那条决定后面。

通知只报告待批、结束或疑似卡顿，不能接收审批；webhook/钉钉 URL 仅从环境变量读取，发送失败不影响 Run。看门进程是运行反馈的内部实现。
