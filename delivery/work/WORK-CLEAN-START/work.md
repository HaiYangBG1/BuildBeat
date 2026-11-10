# 运行时只做记、验、审、批，只认当前写法

## 目标

现在的运行时一半以上在"驱动 AI 干活"：派它写代码、失败了派它修、数预算、断了续跑。实际用下来，写代码和修代码都是驾驶会话自己做的，宿主工具也已经自带这些。留着它们，新来的人要多学一倍的东西，每次改动要多过一倍的测试。

做完后运行时只做四件事：

- 记：工作说明、决定、收口，和现在一样。
- 验：在一个现成的提交上跑项目自己的验证命令。
- 审：让一个没参与写的只读 AI 审这个提交，问题记进账。
- 批：人的批准绑在这个提交上。

同时只认当前这一种写法：旧命令名、旧配置项、旧格式的读法、历史文档都去掉，随包示例改成当前写法。Git 里的旧记录不删不改，已关的旧工作照样查得到。

## 起因

2026-11-10 所有者：「交付循环 太重了，agent迭代太快，可能反而成为负担或拖累，可能需要做减法」；「历史迁移的兼容日志，因为当前除了我没人用，所以正好可以切干净，给未来的人一个干净的开始，从这个版本砍断牵绊，然后做减法清单」。

这份说明的第一版只切旧兼容，当天按推荐接受（A-WORK-CLEAN-START-1），RUN-CLEAN-START-01 开跑后没改代码就停了：动手前深读发现测试和示例都建在旧写法上，而这些测试大半是减法要删的。所有者定「先出减法清单」，看过清单后说「按建议定」。本版把两件事并在一起。

- ref: 试点反馈第 7 条（现成提交一条命令送验证和审查）

## 已核实的现状（2026-11-10，`27e05ae`）

**已确认**

- 用量，取自本仓 Git 里 39 项工作、48 轮运行的记录：运行时写代码 7 轮、修代码 2 轮；216 条决定里 74 条是会话写完交回；人被叫停 126 次，其中合并批准 41 次；扩额批准 4 次；取代旧运行 3 次；约 100 次验证里复用缓存 3 次；17 份配置开了并行；通知和上线回读 0 次。
- 批准时的检查只有四条，在 `src/v2/policy/policy.js:206-218`：这个提交验证通过、工作说明已接受且没变、要截图时有截图、没有未裁决的严重问题。
- 运行的终态只有四种（`src/v2/domain/model.js:18`）。台账格式是冻结的，只增不改（`docs/v2/SPEC-0001-events-v1.md` 开头）；`src/v2/domain/event-registry.js:25` 要求建运行的事件带 riskPreset，`src/v2/domain/event-registry.js:27` 要求绑定工作区的事件带分支和路径。
- 跨仓发现有两条路（`src/v2/runtime/overview-repos.js:215-232`）：各项工作配置里的 repo 指向，和主仓下带 delivery/work 的子目录。
- 旧命令名和新命令行为不同：`src/v2/cli/run.js:732-746` 的 start 不带参数时用配置里写的运行编号，`src/v2/cli/run.js:1647-1683` 的 run 自动编号。
- 测试约 115 处调用用的是旧命令名，14 份夹具用旧配置项（当天 grep）。
- 随包示例是旧格式：`example/delivery/work/WORK-EXPORT-DATE-FILTER/workflow.yaml` 和同目录的 intent、plan。
- 仓库还跟踪着已退役的 `.buildbeat/observe.yaml`。
- 规模：src 12,236 行，测试 12,448 行；`src/v2/runtime/orchestrator.js` 1,956 行，`src/v2/cli/run.js` 2,102 行。
- 本仓 14 项旧格式工作都已关、都有 result.md；改动前的阶段和 5 个文件的追溯结果记在 `delivery/work/WORK-CLEAN-START/baseline.json`。

**待核**

- 临时检出一个提交，能不能照现有事件格式记下来。第一段实现时验证。
- 试点仓没读：在跑的工作、没关的旧格式工作、截图和上线回读的真实用量。发版前只读核对，要所有者同意。

## 范围

分三段，每段单独验证、单独审查、单独由所有者决定合并。

- 第一段，只加不删：新的一轮（第 1～4 项）和它的测试。旧入口原样不动。
- 第二段，删：旧循环、旧命令名、旧配置项、旧运行特判、旧格式读法（第 5～8 项），连同只测它们的测试；其余测试改用新入口。
- 第三段，门面：随包示例、模板、Skill、指南、README 文字、本仓自己的配置换成当前写法；历史文档和评测按第 9、10 项处理。

不包含：

- 读者测试：下一项工作。
- 路径里的 `v2` 改名、不再维护 `v2` 分支：三段合入后、发版前另做。
- 试点仓的迁移；发版、推送、版本号。
- README 的配图。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 送一个提交去验和审的命令 | `buildbeat review --repo <path> --work <ID> [--commit <sha>]`，不写就是 HEAD。临时检出该提交，跑验证，过了再跑只读审查，跑完删掉检出 | 沿用 `run`：少改一个习惯，但它不再"跑"流程 |
| 2 | 一轮怎么收场 | 验证没过：这一轮记 `FAILED`。审完：等所有者决定，有没裁决的严重问题时批准会被拒。同一工作又送来新提交：还在等的旧轮记 `SUPERSEDED` | 有严重问题就直接记失败：驳回问题后还得重审一遍才能批 |
| 3 | 批准和拒绝 | `buildbeat decide --repo <path> --work <ID> --action approve --candidate <完整 SHA>`；`--action reject --reason <text>`。不再写 `--run`、`--transition` | 保留原写法：多两个只有一种取值的参数 |
| 4 | 配置放哪 | 项目一份 `delivery/run-config.yaml`，键只有 `workers`（`verifier`、`reviewer`）、`envelope`、`requires`、`redact`、`release`、`requireScreenshot`、`maxReviewSeverity`。单项工作要覆盖时写 `delivery/work/<ID>/run-config.yaml`，另可写 `allowedPaths`、`base`。运行编号是 `RUN-<工作编号去掉 WORK->-<两位序号>` | 仍然每项工作一份完整配置：每项工作多两个文件 |
| 5 | 去掉的命令 | `run`、`stop`、`gc`、`watch`、`start`、`resume`、`overview`、`inbox`、`metrics`、`approve`、`reject`、`findings`、`doctor`、`preflight`、`events`、`replay`、`observe`，都按未知命令处理。`check` 改成 `buildbeat check --repo <path> [--work <ID>]`，`release` 改成 `buildbeat release --repo <path> --work <ID> [--env <name>] [--ref <ref>] [--note <text>]` | 留一版只提示改用哪个：以后还要再删一次 |
| 6 | 去掉的配置项和功能 | `repo`、`work`、`run`、`workflow`、`riskPreset`、`entry`、`policies`、`budgets`、`cache`、`reviewTriage`、`stopAt`、`supersede`、`parallel`、`stallAfterMs`、`workers.builder`、`workers.fixer` 一律报 `unknown key`。通知、停顿检测、预算、缓存、并行随之删除，不留开关 | 忽略并提醒：又留了一层兼容 |
| 7 | status 显示什么 | 成本行只剩 `cost: review rounds <n> · findings <m>`，去掉末尾的统计块。`--all-repos` 只认主仓下带 delivery/work 的子目录 | 保留人等了几次、worker 用时：这两个数随循环一起没有了来源 |
| 8 | 旧格式的工作 | 运行时不再读 intent、plan、workflow 文件。已关的靠 result.md 和运行记录照常显示，标题取 result.md 第一行。没关的阶段写 `LEGACY`，下一步写 `legacy records: read the folder, or close it with a result.md` | 继续读旧文件：运行时一直背两种写法 |
| 9 | 历史文档 | 删 `docs/MIGRATION.md`、`CHANGELOG-v1.md`、`docs/history/`、`docs/releases/`、三份 RFC、M 开头的验收记录、`.buildbeat/observe.yaml`。`docs/v2/SPEC-0001-events-v1.md` 留下。`CHANGELOG.md` 重新写，开头一行 `Earlier history: see tag v5.5.0.` | 挪进归档目录：新来的人照样会翻到 |
| 10 | 评测和教训 | 评测留 `reviewer-readonly`、`stale-approval`、`evidence-required`、`gate-cannot-self-pass`，删另外五个。`lessons.md` 删掉只讲已删功能的条目，删了哪些写进 result.md | 全部保留：指向不存在的命令 |
| 11 | 止损线和版本 | 这项工作的审查上限共 12 轮。三段都合入后另行发 6.0.0，只断一次 | 每段发一个版本：三个主版本 |

## 验收

机器检查，每段都要过全套门禁：`npm test`、`npm run check:docs`、`npm run test:envelope`、`npm run test:plugin`、`npm run test:pack-firstrun`、`npm run pack:check`。

- 第一段：夹具仓里用新命令走通——接受、送审、有问题、改完再送、旧轮被取代、裁决、批准；候选换了以后旧批准失效；写出的运行记录和决定记录，5.5.0 的 status 和 history 读得出来。
- 第二段：第 5、6 项列的命令和配置项都报错；baseline.json 里的阶段和追溯结果不变（原 `NO_INTENT` 那项显示 `LEGACY`）；`src` 不超过 8,000 行。
- 第三段：示例首跑测试用当前写法通过；`SKILL.md` 不超过 10 KB；`grep -rnE "3\.3\.1|MIGRATION\.md|intent\.md|plan\.md" src bin SKILL.md` 没有结果；`npm pack --dry-run` 的清单里没有迁移说明。

由人确认：每段的合并决定；发版前试点只读核对的结果。

## 实现步骤

1. 第一段：新建一轮的实现，复用现有的台账、证据、问题账、批准检查；项目级配置的读法；`review` 和按工作批准的命令；测试。
2. 第二段：先删只测旧循环的测试和对应代码，再把剩下的测试改到新入口，最后删旧命令名、旧配置项、旧格式读法；对比基线。
3. 第三段：示例、模板、本仓配置、Skill、指南、README 文字；删历史文档并修链接和文档检查；重写 CHANGELOG 开头。
4. 每段写完交给验证和独立审查，停在所有者的合并决定；三段都合入后写 result.md。

## 停止条件

- 台账或记录格式要做"只增"以外的改动。
- 新入口写出的记录，旧的读法读不出来。
- 基线里已关的工作消失，或追到的行数变少。
- 留下的能力（截图证据、上线回读、范围检查、批准绑提交、审查只读）在新入口下做不到原来的效果。
- 要删的东西超出第 5、6、9、10 项的清单。
- 审查到 12 轮。
