# 审查不再卡人：可以先不配，配的话用手上那个工具另开一个只读会话

## 目标

很多人只装了一个 AI 工具，而且用什么的都有：Codex、Claude Code、Cursor、Gemini、WorkBuddy……也有人一开始根本不想配审查。做完后：

- **审查可以先不配。** 项目配置里不写 `workers.reviewer` 也能用：`buildbeat review` 只跑验证，然后照常停在人的决定；状态、决定卡片和批准记录都写明"这个提交没经过审查"，不会被说成审过了。以后想加，补上 `workers.reviewer` 就行。
- **要配的话，手上那个工具就行。** 安装提示、Skill、样板和指南都说清楚：审查要的是另开一个没参与写代码的只读会话，用的可以就是你正在用的工具，不分哪家，只要它能在命令行里无头运行一次、把回答打到输出。指南教负责安装的 AI 怎么为任意工具配出审查命令，常见几种列作例子，标明只有 codex 实测过。
- **配错了早点知道。** `buildbeat check` 发现审查用的工具不在本机时直接报出来，并给两条路：换成你有的工具，或者先删掉 `workers.reviewer`、只跑验证。

## 起因

2026-11-18 所有者说：「当前buildbeat明确会要求有第二个agent，可能会卡主一些人，因为很多人可能只有一个？这种情况下怎么解决？」会话查过后答：不需要第二个产品，样板写死了 codex、文案写"另一个 AI"才会卡人。所有者说：「做成一项工作」。之后所有者纠正范围：「用户也不一定用的claude」；「我只是举例子，用户可能会用各种软件，本项目的测试还是codex」；并加了一条：「另外，可以允许用户先不配置审查，不要作为卡死项」。

## 已核实的现状（2026-11-18，`4a62c92`）

**已确认**

- 运行时把审查者当必填：读配置时缺 `workers.reviewer` 报 `workers.reviewer: required and missing`（`src/cli/review-config.js:277-283`）；送审时缺了直接抛错 `a review needs a verifier and a reviewer`（`src/runtime/orchestrator.js:818-824`）。
- 一轮送审固定是验证、审查两步（`src/engine/workflow.js:21-25`），按顺序跑完后才停到人的决定（`src/runtime/orchestrator.js:616-640`）；这份流程的文字摘要写进每一轮的记录（`src/engine/workflow.js:7-18`、`src/runtime/orchestrator.js:888-888`）。停下时给人的理由写的是"verified and reviewed"（`src/runtime/orchestrator.js:662-662`）。
- 读者测试没配 `workers.reader` 时借用审查者的命令，两个都没有就报错（`src/cli/run.js:314-316`）。
- README 的安装提示第 4 步写"审查默认用本机已登录的另一个 AI 命令行工具"（`README.md:147-147`，英文 `README.en.md:147-147` 是 "another AI command-line tool"）。只有一个工具的人读到这里会以为装不了。
- 样板的审查命令是 `codex exec -s read-only`，换工具的写法只在一行注释里点了名字（`templates/run-config.example.yaml:38-48`）。
- `worker.sh` 把提示词作为最后一个参数交给工具、收它的标准输出（`templates/envelope/worker.sh:31-44`），所以任何"把提示词当参数、把回答打到输出"的命令行工具都能接；找不到工具时退出 75（`templates/envelope/worker.sh:26-29`），每一轮都记为 `CANCELLED`。
- 审查者动了检出里的文件，这一轮作废（`docs/guide/05-worker-contract.md:7-7`）。所以工具自己没有只读开关时，运行时这一层仍兜得住"改了文件"，兜不住它读 HOME 下的文件。
- `check` 只检查 `requires:` 里写明的命令（`src/cli/run.js:694-706`），不看审查命令里的工具在不在；样板的 `requires:` 只有 node（`templates/run-config.example.yaml:20-22`）。
- 能力矩阵写着真实 AI 审查只用 codex exec 跑过（`docs/CAPABILITY-MATRIX.md:23-24`）。
- Skill 已经说"审查者是另一个上下文里的只读 AI"（`SKILL.md:43-43`），配置一节没提只有一个工具或不配审查时怎么办（`SKILL.md:61-65`）。
- 工具的命令行不一定在 PATH 上：本机 WorkBuddy 5.5.6 的命令行 `codebuddy` 在它的 App 包里（`/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`），要单独登录；没登录时退出码 0、输出为空，运行时会当成没交报告，这一轮 `CANCELLED`。
- 测试按样板里 `- codex` 四行做替换（`tests/templates-firstrun.test.js:87-92`、`tests/pack-firstrun.test.sh:125-134`），样板默认值改掉要连带改测试。
- `src` 现在 8,347 行（`find src -name '*.js' | xargs cat | wc -l`）。

**待核**

- 状态总览、`status --work`、`history --path`、关窗和上线回读里，哪些地方默认"有审查记录"，实现时逐处查；没审查的提交在这些地方都要显示成"没审查"，不能显示成"审查通过、0 个问题"。

## 范围

做：

- 运行时：`workers.reviewer` 改为可选。没配时 `review` 只跑验证，停到人的决定；这一轮记录里的流程摘要是"只验证"那一份，停下的理由写明没审查；状态、决定卡片、批准记录、`history --path` 都显示"没审查"。批准照常允许。
- `check`：没配审查者时打印一行说明，不算问题；配了但工具找不到，记为 PROBLEM 并给两条改法；补测试。
- 读者测试：两个都没配时的报错改成说明可以配 `workers.reader` 或 `workers.reviewer`。
- 文档：README 中英安装提示第 4 步；指南 `04-adapter-guide`（中英）加一节"只有一个 AI 工具，或者先不配审查"；`02-workflow-guide`（中英）里"一轮送审做什么"补上不配审查的情况；快速开始（中英）；样板 `run-config.example.yaml` 的注释；Skill 配置一节和"写的不审"一条；能力矩阵里审查一行。

不做：

- 验证仍然必填：没有验证命令，批准就没有任何真实证据可绑。
- 不逐个实测别的工具；本仓的验证和审查照旧用 codex，能力矩阵不加别的工具。
- 不加 `init` 之类自动生成配置的命令；装的时候选哪个工具由按 README 安装的那个 AI 会话来定。
- 不做"人工把提示词贴进聊天窗口再贴回来"的审查方式。
- 不改本仓自己的 `delivery/run-config.yaml`。不发版、不推送。

## 开工前待拍板

接受本说明即按「推荐」执行。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 没配审查时送审做什么 | 只跑验证，过了就停到人的决定；批准照常允许，批准记录和状态写明"没审查" | 没审查就不许批准：等于还是卡死项 |
| 2 | 记录里怎么区分 | 加一份"只验证"的流程文字（只有 verify 和 wait-merge），没配审查的轮次记它的摘要；停下的理由写 `verified; not reviewed: no workers.reviewer in the run config` | 沿用原流程、审查一步记成跳过：流程摘要说做了审查、实际没做，记录自相矛盾 |
| 3 | 提醒到什么程度 | 没配审查时，`check` 和每次 `review` 各打一行 `note: no reviewer configured; commits are verified, not reviewed (docs/guide/04-adapter-guide.md)`，不拦 | 不提醒：用户忘了自己没配审查 |
| 4 | 样板默认 | 仍写 codex，注释说明两条路：换成你手上的工具（指向指南那一节），或删掉这一段先只验证 | 样板默认不配审查：照抄的人就丢了审查，而它是这个产品的主要好处之一 |
| 5 | 指南怎么教配审查 | 以步骤为主，例子为辅：找命令行（有的藏在桌面应用里、不在 PATH 上）、查 `--help` 里的无头和只读参数、写进配置、`check`；几种常见写法作例子，只有 codex 标实测过 | 只列一张工具表：表外的工具没人知道怎么配，参数一变就过时 |
| 6 | 怎么说用同一个工具审的局限 | 写明：新上下文、只读、真实验证命令这三样都有；写和审是同一个模型时盲点更可能重合，有两个工具时仍推荐换一个来审；工具没有只读开关时，运行时只兜得住改文件 | 不提：用户以为和跨工具审查一样可靠 |
| 7 | 配了但工具找不到 | `check` 记 `PROBLEM reviewer: codex is not on PATH; put the AI command-line tool you have after "--", or remove workers.reviewer to verify only (docs/guide/04-adapter-guide.md)`，退出码 1。命令是 `worker.sh <角色> -- <工具> …` 时查 `--` 后面的工具，否则查 `command`；名字查 PATH，路径查文件能不能执行 | 只打提示：送审照样每轮 `CANCELLED` |
| 8 | 没有命令行无头模式的工具 | 指南说清楚：可以不配审查、只跑验证；或者用[只用 Skill 和项目文件](../../../docs/guide/12-without-runtime.md)的方式。都不能声称做过独立审查 | 做人工贴回的审查方式：多一种流程要维护，记录也证明不了贴回的是审查者原话 |
| 9 | 代码规模和止损线 | `src` 不超过 8,450 行；审查上限 6 轮 | — |

## 验收

- `npm test && npm run check:docs && npm run test:envelope && npm run test:plugin && npm run test:pack-firstrun && npm run pack:check` 全过（本仓的验证命令）。
- 新测试：
  - 配置里没有 `workers.reviewer`：`check` 打印那行说明、不报问题；`review` 只跑验证、停到决定，记录里是"只验证"的流程摘要；批准能做，`status --work` 和决定卡片显示没审查；验证失败照常 `FAILED`。
  - 配了审查者但工具不在 PATH：`check` 打印 PROBLEM 并退出 1；工具在 PATH 上、或写的是存在的可执行文件路径时不报。
  - 原来配了审查者的流程行为不变（现有测试全过）。
- 本工作的提交经本仓配置（codex）送审，没有未裁决的 P0/P1。
- 读 README 安装提示第 4 步和指南那一节，只有一个工具（不一定是 Codex）、或者暂时不想配审查的人，知道该怎么做。

## 实施计划

1. 运行时：配置读取、送审流程、停下的理由、状态与历史的显示，补测试。
2. `check` 的两种情况，补测试。
3. 文档：指南、快速开始、样板注释、Skill、README 中英、能力矩阵。
4. 提交，`buildbeat review` 送审。
5. 停在合并决定。

## 停止条件

- 某处要动已冻结的台账事件格式才能表达"没审查"：停下，说明要改什么，问所有者。
- 审查 6 轮还有 P0/P1。
- `src` 超过 8,450 行还收不住。
