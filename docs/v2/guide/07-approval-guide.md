# 决定与证据

[English](07-approval-guide.en.md)

## 接受工作说明

一项工作只有一份 work.md。`buildbeat accept --repo . --work <ID>` 记下的是这份文件当时的摘要；文件再改，旧的接受就失效。接受不会自动开工。

## 读者测试

`buildbeat reader --repo . --work <ID> [--doc work|result]` 把一份文档交给一个没有任何上下文的只读 AI：只给它这一份文档的正文，它在项目之外一个新建的空目录里运行，回答一组固定的问题（work.md 七问，result.md 五问，最后一问是"还有什么不知道、只能猜的"）。不写 `--doc` 时，有 result.md 就测它，没有就测 work.md。

出来三样东西：它读出来的答案；它答不出的地方；能和 Git、记录对上的答案由运行时核对并标出 ✓ 或 ✗。只核对三项：work.md 的"要改哪些目录或文件"（要读者一项只写一个路径）：有提交后，看实际改过的每个文件是不是都被答到或落在答到的目录里；还没有提交时，看答到的路径是不是都在 `allowedPaths` 之内；result.md 的"在哪个提交"对照被批准的提交；"写进了哪些文档"对照 Git 核对通过的写回行。没有可对照的事实就不核对，不算错。

每次结果连同文档的摘要和字节数追加到 `delivery/work/<ID>/reader-tests.jsonl`。`status --work <ID>` 显示 `reader: work.md · answered <n>/<m> · unanswered <k> · checked <a>/<b> · <KB> KB`，文档改过后显示 `reader: work.md changed since its reader test`。不打总分，不拦接受和关窗；当前这份 work.md 没测过时 `accept` 提醒一行。

读者用配置里的 `workers.reader`；没写就用 `workers.reviewer` 的命令，提示词是 `prompts/reader.md`。工具超时、崩溃、exit 75 或答案读不懂时退出码 1，不写记录。运行时拦不住工具读别的文件，它只是不把项目给读者。

## 批准或拒绝一个提交

送审停下后，`buildbeat status --repo . --work <ID>` 列出等待决定的提交、验证和审查的证据、审查问题，以及可以直接复制的命令：

- 批准：`buildbeat decide --repo . --work <ID> --action approve --candidate <完整 SHA>`
- 拒绝：`buildbeat decide --repo . --work <ID> --action reject --reason <原因>`

批准前运行时重新核对一遍：等待决定的就是这个提交，work.md 还是被接受的那份，验证证据在，没有未裁决的严重问题。对不上就拒绝，写的提交号不是等待的那个会报 `approval stale`。批准只表示这个提交具备合并条件；合并、推送、上线仍由人做。

发现还要改：修在新提交里再送审，旧的一轮自动作废，不需要先拒绝。

## 裁决审查问题

不同意某条问题，或者决定先不改：`buildbeat decide --repo . --work <ID> --action accept|dismiss --fingerprint <指纹> --note <理由>`。`dismiss` 是这条不成立或不改，`accept` 是认可但不在这一轮改。裁决按指纹记在这项工作上，同一条问题以后再出现会标成 `reRaised`，不再拦批准；换了说法的算新问题。

## 上线回读

合并和上线由人完成。上线后运行 `buildbeat release --repo . --work <ID> [--env <环境>] [--ref <ref>] [--note <第几步>]`：它确认这项工作被批准的提交包含在 `--ref`（默认当前 HEAD）里，在主检出执行配置里 `release:` 段的只读回读命令（形状、环境白名单与脱敏同验证命令），把结果、退出码、提交、环境、输出摘要和末尾若干行追加到 `delivery/work/<ID>/releases.jsonl`。

一份配置管所有环境：`--env` 记进回读记录，也作为 `BUILDBEAT_RELEASE_ENV` 传给回读命令，由项目脚本按环境去查。分几步上线的，每一步各回读一次，用 `--note` 写是第几步。没送审过、在会话里直接做完的工作也能记回读，绑定到这项工作在 `--ref` 里最新的代码提交；一个都追不到就拒绝。送审过的工作要先有被批准的提交才能回读。只记回读、不审查的项目，配置里只写 `release:` 即可。

`buildbeat status --repo . --releases [--all-repos] [--json]` 按环境列出最近一次通过的回读是哪项工作、哪个提交、什么时候、第几步，之后又失败的同一行标出，回答"现在线上是什么"。这类会变的事实不要抄进项目文件。

## 收口和关窗

每项工作都以一页结果收口。照 `templates/v2/result.example.md` 写 `delivery/work/<ID>/result.md`：做成了什么、在哪个提交和版本，定了什么，剩下什么、转去了哪里，写进了项目哪些文档。以后还用得上的结论先写进项目自己的文档并提交，再在 result.md 里每条写成 `- <路径> @ <提交> — <写了什么>`。然后用 `buildbeat decide --repo . --work <ID> --action close [--result <text>] [--note <text>]` 关窗：

- 项目配置里的 `release:` 只是默认的回读命令。工作自己的 `run-config.yaml` 写了 `release:`，或者已经记过回读的，最近一次回读必须通过才能关窗，关窗决定同时绑定这次回读。其他工作有了 result.md 就能关。还有一轮在跑或在等决定时不能关窗。
- 运行时把 result.md 的 SHA-256 记为 `resultDigest`。不写 `--result` 时，摘要取 result.md 里第一行既非空、也不是标题的文字（跳过代码块和 HTML 注释）。
- 每条写回行都要核对：提交已经在主检出当前所在的分支上、确实改了这个文件、文件不在本工作自己的目录里。有一条不成立就拒绝关窗，并一次列出全部问题；全部通过的记为 `promotions`。一条都没写就记为空列表。
- `status --work <ID>` 随时现场核对写回行（✓/✗），关窗前就能先看；关窗后 result.md 又改过，status 会标出 `result.md changed after closing`。

没送审就做完的工作显示 `COMMITTED`：`buildbeat decide --repo . --work <ID> --action close --draft` 按它的提交起草 result.md，对照 Git 改好再关。

## 谁做的决定

每条决定都记下是谁、以什么身份做的：`--by` 写名字，`--as human|agent` 写是人还是 AI 会话。不写 `--as` 时看执行环境：在 AI 编程工具里执行（识别 `CLAUDECODE`、`AI_AGENT`、`CODEX_SANDBOX` / `CODEX_THREAD_ID`；其他工具可设 `BUILDBEAT_ACTOR=agent`）记为 AI 会话，名字默认是工具名；否则记为人，名字默认取 `git config user.name`，取不到就要求写 `--by`。AI 会话转达你在对话里说的决定时用 `--as human --by <你的名字>`，记录会注明"经 AI 会话录入"。

`status --work <ID>` 列出每条决定（含问题的裁决）和身份；最近一次批准来自 AI 会话时，status 会单独标出。旧记录没有身份字段，显示"身份未记录"，不按名字猜。接受、批准和关窗时可以加 `--note <text>`，记下人的原话或理由。
