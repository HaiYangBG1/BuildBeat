---
name: buildbeat
description: BuildBeat 把每项需求为什么做、定了什么、做到哪记在项目的 Git 里，换会话、换工具、换人都能接着干；会话写完代码后，运行时 `buildbeat` 把提交送去验证和独立只读审查，带证据停在人的合并决定。用于持续迭代、接手、查看进度、送审、处理决定和收口关窗。
---

# BuildBeat

承诺：换会话能接着干，交付有证据。代码由会话自己写、自己提交；运行时 `buildbeat` 在那个提交上跑项目的验证，请一个没参与写的只读 AI 审查，再把人的批准绑在这个提交上。没有运行时也能只用 Skill 和项目文件把上下文记完整，见[只用 Skill 和项目文件](docs/guide/12-without-runtime.md)；那时如实说明哪些检查没有执行。

先跑 `buildbeat --version`。低于 6 就升级；升级前用旧版把在跑的工作跑完或取消。旧版本留下的记录不用动。

## 会话操作

| 用户意图 | 操作 |
|---|---|
| 接手、看进度、有什么待批 | `buildbeat status --repo .`；主仓里还有别的代码仓时加 `--all-repos`；单项工作加 `--work <ID>`，可加 `--json` |
| 这件事整体到哪了 | `status --repo . --work <ID>` 列出串起来的工作；手里只有任务、决策或合并请求编号时用 `--ref <编号>` |
| 这段代码为什么这样 | `buildbeat history --repo . --path <文件>[:<行>[-<行>]]`，再读列出的 work.md、result.md 和决定；追不到的行如实说，不按提交标题猜 |
| 准备一项工作 | 先在已关工作的 `result.md` 里搜相关结论和遗留；照 `templates/work.example.md` 的八节写 `delivery/work/<ID>/work.md`（写法见下），提交 |
| 接手放了一阵的工作 | `status --repo . --work <ID>` 看 `facts:`；列为变了或找不到的重新核实，更新现状和标题里的提交号后重新接受 |
| 让没上下文的读者读一遍 | `buildbeat reader --repo . --work <ID>`：一个只看得到这份文档的只读 AI 回答几个固定问题。把它读出来的答案给用户看，它答不出的地方由你决定补不补进文档。写完 work.md、写完 result.md 各测一次；不拦接受和关窗 |
| 接受工作说明 | `buildbeat accept --repo . --work <ID> --as human --by <owner> [--note <原话>]`；用户已明确授权就直接记，不重复问 |
| 写代码 | 会话自己写、自己提交，提交信息末尾空一行写 `Work: <ID>`。work.md 要先于代码提交：它那个提交之后的改动才算这项工作的 |
| 送审 | `buildbeat review --repo . --work <ID> [--commit <sha>]`，不写就是 HEAD。可能跑很久，脱离宿主的短超时启动 |
| 审查有问题 | 修在新提交里再送审，旧的那轮自动作废。不同意的问题请用户裁决：`buildbeat decide --repo . --work <ID> --action accept\|dismiss --fingerprint <fp> --as human --by <owner> --note <理由>` |
| 批准、拒绝 | 转达用户的决定：`buildbeat decide --repo . --work <ID> --action approve --candidate <完整 SHA> --as human --by <owner>`；拒绝用 `--action reject --reason <原因>` |
| 配置或环境有问题 | `buildbeat check --repo . [--work <ID>]` |
| 上线回读 | 人完成上线后 `buildbeat release --repo . --work <ID> [--env <环境>] [--note <第几步>]`。问"线上是哪个版本"用 `status --repo . --releases`，不要把版本抄进项目文件 |
| 收口、关窗 | 见下面"写工作说明与收口"。没送审就做完的工作显示 `COMMITTED`：先 `buildbeat decide --repo . --work <ID> --action close --draft` 起草 `result.md`，对照 Git 改好再关 |

## 一轮审查怎么收场

- `FAILED`：验证没过，或提交改了 `allowedPaths` 之外的目录，或验证后检出不干净。修好再送。
- `CANCELLED`：工具出了问题（超时、崩溃、exit 75、审查者没交报告或动了文件）。这不是对提交的判定，环境好了再送。
- 等用户决定：验证过了、审完了。还有没裁决的 P0、P1 时批准会被拒，先修或先裁决。

找用户只在这几处：工作说明要确认、审完等拍板、问题要裁决、环境坏了。

## 执行规则

- 用户只需理解工作、进度和决定；命令和编号由会话处理。
- 一项工作对一个可验收的结果负责。范围内继续推进，不因单个文件或步骤完成就结束。
- 写的不审。审查者是另一个上下文里的只读 AI；会话自己说"检查过了"不算证据，只有 Git 和真实命令的结果算。
- 决定身份如实记。用户在对话里明确说出的决定，用 `--as human --by <owner>` 转达，记录会注明经 AI 会话录入；会话不得替人批准。
- `delivery/` 跟代码一起进 Git，不要用 `.gitignore` 或 `.git/info/exclude` 排除它。其中的截图、压缩包和日志不进 Git，`templates/gitignore.template` 已写好规则。工作文件夹只放这项工作的记录和它确实要用的少量文件；命令输出、一次性脚本不放进去，结论写进 `result.md`。这几条 `accept` 和 `check` 都会提醒。
- `buildbeat hooks install --repo .` 装一个 commit-msg 钩子，标题里只写了一个工作编号时自动补 `Work:` 标记，不覆盖项目已有的钩子。
- 新会话先读项目入口（AGENTS.md）、work.md、Git 和 status。
- 项目已有的规范归项目，不覆盖。部署和线上监控用项目自己的工具。有界面的项目在配置里写 `requireScreenshot: true`，验证命令把真渲染的截图以 PNG 写进 `BUILDBEAT_SCREENSHOT_DIR`。
- merge、push、发布、部署各要各的授权；批准只表示这个提交具备合并条件。不要用 `git add -A`，只提交本次具体的文件。
- 范围检查、环境变量白名单、批准绑提交、台账校验，都不替代宿主沙箱和服务端保护。

## 写工作说明与收口

- "起因"写谁、什么时候、原话是什么，以及接着哪项已关工作。相关的工作写成关系行，一行一个：接着、修正或取代的写 `- follows: <编号>`，拆出来的写 `- split from: <编号>`，其他相关的写 `- related: <编号>`，任务、决策、合并请求编号写 `- ref: <编号>`。新工作指向旧工作，不回头改已接受的 work.md。
- "已核实的现状"的标题写日期和核实时的提交号。已确认的每条带出处（文件、提交、命令输出），待核的写明由谁、什么时候确认，不把推断写成事实。引用代码写成反引号里的 `路径`、`路径:行` 或 `路径:起-止`，运行时据此比对这些代码后来变了没有。从别的工作抄来的现状只当线索，重查后写自己的提交号。
- "开工前待拍板"每项给推荐和另一种做法的后果，用户接受即按推荐；对外可见的名字（命令、参数、文件、提示文字）写原文。"验收"把机器能查的和只有人或线上能确认的分开写。"停止条件"写必须停下问人的情况。
- 收口前逐项看哪些结论该写回项目：对外约定变了；以后的工作要遵守的决定；还会再踩的环境事实（能机器检查的写进配置的 `requires:`）；项目文档说错或过时了；审查提示词该改。写进项目已有的文档，没有合适的就写进 AGENTS.md，保持短。会变的事实（版本、进度、谁在做、上没上线）不写进项目文档，只写去哪查。
- 关窗：合并后写 `delivery/work/<ID>/result.md`（模板 `templates/result.example.md`），开头一段写做成了什么、在哪，然后是定了什么、剩下什么（写明转去哪）、写进了项目哪些文档。写回的改动和 `result.md` 摘要放在一屏给用户看；用户同意后提交写回改动，在 `result.md` 里记成 `- <路径> @ <提交> — <写了什么>`，都没有就写"无"和原因。`status --repo . --work <ID>` 核对通过后 `buildbeat decide --repo . --work <ID> --action close --as human --by <owner> [--note <原话>]`，再把 `result.md` 和 `decisions.jsonl` 一起提交。声明了上线的工作，最近一次回读通过才能关。
- 关窗只表示这项工作的上下文收尾，不代表已经上线。

## 配置

项目一份 `delivery/run-config.yaml`，说这个项目里一个提交怎么验、怎么审。样板是 `templates/run-config.example.yaml`，照抄后把验证命令和审查命令换成真实的；`templates/envelope/` 复制成 `delivery/envelope/`。

单项工作要和项目不一样时，在 `delivery/work/<ID>/run-config.yaml` 里只写要覆盖的键。那里还能写 `allowedPaths`（这项工作能改哪些目录）、`base`（从哪个提交算起）、`release`（声明这项工作要上线，关窗前必须回读通过）。

## 按需阅读

- [快速开始](docs/guide/01-quickstart.md)
- [一轮审查与配置](docs/guide/02-workflow-guide.md)
- [决定与证据](docs/guide/07-approval-guide.md)
- [接续](docs/guide/11-session-handoff.md)
- [安全边界](docs/guide/09-security-boundaries.md)
- [只用 Skill 和项目文件](docs/guide/12-without-runtime.md)
