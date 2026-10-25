---
name: buildbeat
description: BuildBeat 用项目文件接续上下文，在隔离工作树内自动实现、验证、审查和修复，带证据停在人的合并决定。用于持续迭代、换会话或工具接手、查看进度、执行工作、处理决定、收口关窗和恢复中断。运行时 `buildbeat` 负责推进，Skill 负责使用路由。
---

# BuildBeat

承诺：换会话能接着干，AI 自动推进工作，交付有证据。入口是 Skill，执行需要本地 `buildbeat` 运行时；文件始终可读，手工接管时必须如实说明哪些自动机制没有执行。

## 运行时版本

先跑 `buildbeat --version`，按结果选命令：

- 4.x：按下文操作，但合并决定点的两种修复入口有下述版本限制。
- 3.x：下文的 `run`、`status --work`、`decide`、`check`、`history` 和 `work.md` 在 3.x 不存在，沿用项目现有的 3.x 写法：`intent.md` + `plan.md`，分别 `accept --artifact intent` 与 `accept --artifact plan`；`start --config <config> --attempt new` 开工，`resume --config <config> [--run <RUN>] [--adopt <sha> --by <name>]` 续跑；`overview`、`inbox`、`status --run <RUN>` 看进度；`approve --transition <t>` / `reject --reason <why>` 决定；`findings adjudicate` 裁决问题；`doctor` 检查配置；run-config 保留 `workflow:` 与 `riskPreset:`。
- 3.x 的活动 Run 只能用 3.x 运行时完成或取消。升级到 4.x 前先问用户，并按[迁移说明](docs/MIGRATION.md)处理。
- 没有运行时：按[不装运行时也能参与](docs/v2/guide/12-without-runtime.md)只读状态、写 `work.md` 和规定格式的决定行；不得代批 Run，不得声称验证、审查或回读已通过。

合并决定点的 `run --adopt`、`decide --action fix` 与批准命令的 `--candidate` 候选绑定要求运行时 4.2 或更高版本。

关系行（`follows` / `split from` / `related` / `ref`）、`status --work` 列出的工作串线和 `status --ref`，需要包含这项改动的运行时；更早的运行时只能读工作说明的正文。

`history --path`（从代码找回工作）和 `delivery/` 被 Git 忽略时的提醒，需要包含这项改动的运行时；更早的运行时上，只能读提交信息和 `delivery/work/*/runs/*/run-record.json` 里每一轮的起点与候选来判断。

现状比对（`status --work` 的 `facts:` 块，`accept` 和 `check` 的 `warning: facts …`）需要包含这项改动的运行时；更早的运行时上，用 `git diff <标题里的提交> HEAD -- <路径>` 自己对。

关窗要求 `result.md`、核对写回行、`--note` 需要包含收口改动的运行时。4.2.3 及更早的运行时关窗仍要求上线回读通过并必须带 `--result`，不读 `result.md`；这时照样写 `result.md`，但不能声称写回行已由运行时核对。

## 会话操作

| 用户意图 | 操作 |
|---|---|
| 接手、查看进度、有什么待批 | `buildbeat status --repo .`；主仓的 run 配置中 `repo:` 指向其他仓时，查看全部代码仓加 `--all-repos`（运行时 4.1 起；可加 `--work`、`--json`）；单仓指定 `--work` 或 `--run` 查看细节 |
| 这件事整体到哪了、有哪些相关工作 | `buildbeat status --repo . --all-repos --work <ID>`，列出串起来的工作和各自阶段；手里只有任务、决策或合并请求编号时用 `--ref <编号>` 找 |
| 这段代码为什么这样、是哪项工作改的 | `buildbeat history --repo . --path <文件>[:<行>[-<行>]]`，再读列出的 work.md、result.md 和决定；追不到的行如实说追不到，不按提交标题猜 |
| 准备一项工作 | 先在已关工作的 `result.md` 里搜相关结论和遗留；照 `templates/v2/work.example.md` 的八节写 `delivery/work/<ID>/work.md`（写法见下）；复制 run-config 样板并填真实命令 |
| 开工前、接手写好一阵的工作 | `buildbeat status --repo . --work <ID>` 看 `facts:` 那块；列为变了或找不到的地方重新核实，更新现状和标题里的提交号后重新接受。`accept`、`check` 打印 `warning: facts …` 时同样处理 |
| 接受工作说明 | `buildbeat accept --repo . --work <ID> --as human --by <owner> [--note <原话>]`；用户已有明确授权时直接记录，不重复问同一个决定 |
| 开工、继续 | `buildbeat run --config <config>`；首次编号，已有运行则恢复；明确新一轮时加 `--new` |
| 批准、拒绝 | 读取状态卡并复制批准或拒绝命令；合并批准为 `buildbeat decide --repo . --run <RUN> --action approve --transition enter-wait-merge --candidate <完整 SHA> --as human --by <owner>`，使用卡片候选；修复后旧候选或未绑定候选的批准失效；非终态决定后续跑 |
| 合并决定退回修复 | `buildbeat decide --repo . --run <RUN> --action fix --reason <要修什么> --as human --by <owner>`；仅合并决定点且有 fixer 时可用，再 `buildbeat run --config <config> --run <RUN>` 续跑；原因记为已接受 P1，重验、再审，review 预算照常累计 |
| 问题接受、驳回 | `buildbeat decide --repo . --work <ID> --action accept|dismiss --fingerprint <fp> --as human --by <owner> --note <reason>` |
| 已手修并提交 | `buildbeat run --config <config> --run <RUN> --adopt <sha> --by <name>`；检查干净工作树与实际 HEAD 后从 verify 继续；合并决定点也可用，此时须为当前候选的新后代且改动不越界 |
| 配置或环境有问题 | `buildbeat check --config <config>`；显式 `--step <step>` 会在主检出执行 worker，只有用户任务需要才调用，结果不是正式证据 |
| 收口、关窗 | 合并后起草 `delivery/work/<ID>/result.md`（模板 `templates/v2/result.example.md`），按下面的清单准备要写回项目文档的改动，把改动和 `result.md` 摘要放在一屏给用户看；用户同意后提交写回改动，在 `result.md` 里填 `路径 @ 提交`，`status --repo . --work <ID>` 核对通过后 `buildbeat decide --repo . --work <ID> --action close --as human --by <owner> [--note <原话>]`，再把 `result.md` 与 `decisions.jsonl` 一起提交。设了 `release:` 的工作，人完成上线后先 `buildbeat release --config <config> [--note <text>]`，最近一次回读通过才能关窗。run 配置在主仓、记录在代码仓时，从主仓执行关窗 |
| 结束一轮 | `buildbeat stop --repo . --run <RUN> --reason <reason>`；活动驱动持锁时先处理进程，不能把 stop 当作进程杀手 |
| 清理 | `buildbeat gc --repo .` 查看计划，授权范围内再加 `--apply`；不得丢唯一候选或脏工作树 |

## 执行规则

- 用户只需理解工作、进度和决定；命令与 Run 编号由会话处理。
- 一个端到端 Work 对一个可验收结果负责。范围内继续推进，不能因单个文件或步骤完成就结束任务。
- 默认固定 build → verify → review → wait-merge，失败经 fix → verify。配置全部检查后才启动；不要生成 workflow.yaml 或 Policy 文件。
- Reviewer 独立、只读；任何自述不能代替 Git 和真实命令的证据。提供 builder/verifier/reviewer/fixer，缺 worker 时明确停下接管。
- 决定身份如实记：用户在对话里明确说出的决定，用 `--as human --by <owner>` 转达，记录会注明经 AI 会话录入；会话自己做的决定（如 `--adopt`）不加 `--as`，自动记为 AI 会话。
- 只在目标确认、真正例外和最终决定处请求用户。review 默认不分诊；不收敛、环境故障、预算耗尽照常停人，不能由驾驶会话冒充人批准。
- Work review 预算默认 6 轮，跨所有 Run 累计；保留缓存、增量审查、人工修复接管和环境故障分类。
- 长运行脱离宿主短超时启动。状态、最近输出、耗时和通知用于发现停顿；STALLED 不等于进程已终止。
- `delivery/` 跟代码一起进 Git：不要用 `.gitignore` 或 `.git/info/exclude` 排除它，`accept` 和 `check` 发现被忽略会提醒。为某项工作手工提交（手修后 `--adopt`、只改文档的工作）时，提交信息末尾空一行写 `Work: <ID>`；随包信封的机械提交会自动带。
- 新会话先读项目入口、work.md、Git 与状态。旧的 intent/plan 和历史记录继续读取；活动运行不能随意删除或重复启动。
- 既有项目规范由项目所有者维护，不覆盖；项目治理模板不在 BuildBeat 范围内。生产监控与部署放在项目工具中。有 UI 的交付在 run-config 写 `requireScreenshot: true`，verify 把真渲染截图以 PNG 写进 `BUILDBEAT_SCREENSHOT_DIR`。
- merge、push、发布、部署需要对应授权；最终批准只表示候选具备合并条件。不要用 `git add -A`，只提交本次具体文件。
- 保留范围检查、环境变量白名单、批准绑定、台账校验。它们不替代宿主沙箱和服务端保护。
- 新项目配置通知时确认用户希望使用的通道；已有决定直接沿用，URL 只来自环境变量。无通知时如实说明。

## 写工作说明与收口

- `work.md` 的"起因"写谁、什么时候、原话是什么，以及接着哪项已关工作。相关的工作写成关系行，一行一个：接着、修正或取代的写 `- follows: <编号>`，从哪项拆出来写 `- split from: <编号>`，其他相关的写 `- related: <编号>`，任务、决策、合并请求编号写 `- ref: <编号>`。新工作指向旧工作，反方向由运行时推出，不回头改已接受的 `work.md`。"已核实的现状"的标题写日期和核实时的提交号，内容分两类：已确认的每条带出处（文件、提交、命令输出），待核的写明由谁、什么时候确认，不把推断写成事实。引用代码写成反引号里的 `路径`、`路径:行` 或 `路径:起-止`（只写路径后半段也行，但要唯一），运行时据此比对这些代码后来变了没有。从别的工作抄来的现状只当线索，重查后写自己的提交号。
- "开工前待拍板"每项给推荐和另一种做法的后果，用户接受即按推荐；对外可见的名字（命令、参数、文件、提示文字）写原文。"验收"把机器能查的和只有人或线上能确认的分开写。"停止条件"写必须停下问人的情况，不只写预算。标题可以按项目的语言写。
- 收口前逐项检查哪些结论该写回项目：对外约定（接口、格式、命令）变了；以后的工作要遵守的决定；还会再踩的环境事实（能机器检查的写进 run-config `requires:`）；过程中发现项目文档说错或过时；worker 提示词该改。写进项目已有的文档（没有合适的就写进 AGENTS.md，保持短，过时的当场删）。改动先给用户看，用户同意后再提交，然后在 `result.md` 记成 `- <路径> @ <提交> — <写了什么>`；都没有就写"无"和原因。
- `result.md` 要短：开头一段写做成了什么、在哪，然后是定了什么、剩下什么（写明转去哪）、写进了项目哪些文档。审查轮数和成本由 status 给出，不复述过程。
- 关窗只表示这项工作的上下文收尾，不代表已经上线；合并、推送、发布照旧要授权。

## 配置样板

以下为完整样板。路径相对工作目录，替换 Work 标识、变更范围和真实工具命令。worker.sh 与 prompts 复制到 delivery/envelope/。

```yaml
# BuildBeat v2 run 配置样板。拷到 delivery/work/<WORK-ID>/run-config.yaml 后改 work / run / allowedPaths / workers。
# 路径相对本文件解析。严格 YAML 子集：只有块列表与块映射（列表项可与键同缩进），行内只允许空的 [] / {}，无锚点，注释必须独占一行。
# 起跑前：buildbeat check --config <本文件>；起跑：buildbeat run --config <本文件>
repo: ../../..
work: WORK-X
# 家族名；run 自动编成 RUN-X-01/02…，--new 开新一轮
run: RUN-X
# builder / fixer 只能改这些目录；越界改动不成为候选
allowedPaths:
  - src
  - tests
# off = P0/P1 finding 直接派 fixer；高风险项目改成 required，每轮先停人分诊再派 fixer
reviewTriage: off
# 非只读步成功不扣次数；review 按轮计费。review 不收敛（修过的 finding 又出现，或阻断数多于上一轮）才在 enter-fix 停人。
# reviewRoundsPerWork 是 review 轮数唯一的上限（默认 6），跨本 Work 所有 Run 累计，对应 intent 的止损线；
# 到顶的阻断 review 在 enter-fix 一次批准修复、重验、再审。总 attempt 超过（配置值 + 人批扩额）的 3 倍前仍兜底停人。
budgets:
  reviewRoundsPerWork: 6
# 默认一个仓库同时只驱动一个 Run。确认本项目的测试不抢固定端口、不共用数据库后，
# 可加 parallel: true，让本 Work 的 Run 与其他同样打开开关的 Work 并行（同一 Work 仍互斥）
# 同树 + 同命令 + 同信封已通过就复用 verify 证据
cache:
  verify: tree
# 内核把 prompts/<worker>.md 喂给 worker（$BUILDBEAT_PROMPT）；模板见 templates/v2/envelope/prompts/
envelope:
  prompts: ../../envelope/prompts
  vars:
    component: app
# worker 输出落成证据前按这些 JS 正则脱敏（不支持 (?i) 这类内联标志）
redact:
  - "(token|secret|password|TOKEN|SECRET|PASSWORD)=\\S+"
# 有 UI 的交付：verify 把真渲染截图以 PNG 写进 $BUILDBEAT_SCREENSHOT_DIR（只收可解码的 PNG），合并检查要求当前候选有截图
# requireScreenshot: true
# 合并并上线后由 buildbeat release 在主检出运行的只读回读命令（形状同 worker）；回读通过后才能关窗
# release:
#   command: bash
#   args:
#     - scripts/readback.sh
# worker 以隔离 worktree 为 cwd 运行；delivery/envelope/worker.sh 已随仓库进 worktree。
# 换工具只改 `--` 后面的命令：codex exec … / claude -p … / 任意脚本。
workers:
  builder:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - builder
      - --
      - codex
      - exec
      - -s
      - workspace-write
  # 真实测试命令；环境不满足就 exit 75（内核当基础设施故障停人）
  verifier:
    command: bash
    args:
      - -lc
      - npm test
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - codex
      - exec
      - -s
      - read-only
  # 不能省：没配它，verify 失败 / review 阻断时 Run 停人等手修
  fixer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - fixer
      - --
      - codex
      - exec
      - -s
      - workspace-write
```

## 按需阅读

- [快速开始](docs/v2/guide/01-quickstart.md)
- [固定流程与配置](docs/v2/guide/02-workflow-guide.md)
- [决定与证据](docs/v2/guide/07-approval-guide.md)
- [恢复](docs/v2/guide/10-recovery.md)、[接续](docs/v2/guide/11-session-handoff.md)
- [安全边界](docs/v2/guide/09-security-boundaries.md)
- [不装运行时也能参与](docs/v2/guide/12-without-runtime.md)
- [迁移](docs/MIGRATION.md)

启动前将 work.md 和 worker 脚本提交到所选 base，确保隔离工作树能读到同一份已确认范围；接受记录可以随后提交。
