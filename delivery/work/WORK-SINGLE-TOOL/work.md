# 只有一个 AI 工具也能用：审查者用手上那个工具另开一个只读会话

## 目标

很多人只装了一个 AI 工具，而且用什么的都有：Codex、Claude Code、Cursor、Gemini、WorkBuddy……做完后，这些人照 README 装 BuildBeat 不会卡在"要另一个 AI"上：

- 安装提示、Skill、样板和指南都说清楚：审查要的是另开一个没参与写代码的只读会话，用的可以就是你手上那个工具，不分哪家。条件只有一个：它能在命令行里无头运行一次、把回答打到输出。
- 指南教负责安装的 AI 怎么为任意工具配出审查命令：找它的命令行（有的藏在桌面应用里、不在 PATH 上），查它的无头运行和只读参数，写进配置，用 `check` 确认。常见几种的写法列作例子，标明只有 codex 实测过。
- `buildbeat check` 发现审查用的工具不在本机时直接报出来，并说怎么改，不用等送审后每轮都 `CANCELLED` 才发现。

## 起因

2026-11-18 所有者说：「当前buildbeat明确会要求有第二个agent，可能会卡主一些人，因为很多人可能只有一个？这种情况下怎么解决？」会话查过后答：不需要第二个产品，样板写死了 codex、文案写"另一个 AI"才会卡人。所有者说：「做成一项工作」。之后所有者两次纠正范围：「用户也不一定用的claude」；「我只是举例子，用户可能会用各种软件，本项目的测试还是codex」。

## 已核实的现状（2026-11-18，`4a62c92`）

**已确认**

- README 的安装提示第 4 步写"审查默认用本机已登录的另一个 AI 命令行工具"（`README.md:147-147`，英文 `README.en.md:147-147` 是 "another AI command-line tool"）。只有一个工具的人读到这里会以为装不了。
- 样板的审查命令是 `codex exec -s read-only`，换工具的写法只在一行注释里点了名字（`templates/run-config.example.yaml:38-48`）。
- `worker.sh` 把提示词作为最后一个参数交给工具、收它的标准输出（`templates/envelope/worker.sh:31-44`），所以任何"把提示词当参数、把回答打到输出"的命令行工具都能接；找不到工具时退出 75（`templates/envelope/worker.sh:26-29`），每一轮都记为 `CANCELLED`。
- 审查者动了检出里的文件，这一轮作废（`docs/guide/05-worker-contract.md:7-7`）。所以工具自己没有只读开关时，运行时这一层仍兜得住"改了文件"，兜不住它读 HOME 下的文件。
- `check` 只检查 `requires:` 里写明的命令（`src/cli/run.js:694-706`），不看审查命令里的工具在不在；样板的 `requires:` 只有 node（`templates/run-config.example.yaml:20-22`）。
- 能力矩阵写着真实 AI 审查只用 codex exec 跑过（`docs/CAPABILITY-MATRIX.md:23-24`）。
- Skill 已经说"审查者是另一个上下文里的只读 AI"（`SKILL.md:43-43`），配置一节没提只有一个工具时怎么配（`SKILL.md:61-65`）。
- 工具的命令行不一定在 PATH 上：本机 WorkBuddy 5.5.6 的命令行 `codebuddy` 在它的 App 包里（`/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`），要单独登录；没登录时退出码 0、输出为空，运行时会当成没交报告，这一轮 `CANCELLED`。
- 测试按样板里 `- codex` 四行做替换（`tests/templates-firstrun.test.js:87-92`、`tests/pack-firstrun.test.sh:125-134`），样板默认值改掉要连带改测试。
- `src` 现在 8,347 行（`find src -name '*.js' | xargs cat | wc -l`）。

## 范围

做：

- README 中英安装提示第 4 步改说法：审查用本机已有的 AI 命令行工具，可以就是你正在用的这个，另开一个无头只读会话；拿不准就问。
- 指南 `04-adapter-guide`（中英）加一节"只有一个 AI 工具"：原理；为任意工具配审查命令的步骤；几种常见工具的写法作例子，标明只有 codex 实测过；为什么这样也算独立、它弱在哪；没有命令行无头模式怎么办。快速开始（中英）配置示例后加一句指过去。
- 样板 `run-config.example.yaml` 审查命令上的注释改成指向这一节，默认仍是 codex。
- Skill 配置一节加一句。
- `check` 检查每个 worker 实际要跑的工具在不在，不在记为 PROBLEM 并给改法；补测试。

不做：

- 不逐个实测别的工具；本仓的验证和审查照旧用 codex，能力矩阵不加别的工具。
- 不加 `init` 之类自动生成配置的命令；装的时候选哪个工具由按 README 安装的那个 AI 会话来定。
- 不做"人工把提示词贴进聊天窗口再贴回来"的审查方式。
- 不改本仓自己的 `delivery/run-config.yaml`。不发版、不推送。

## 开工前待拍板

接受本说明即按「推荐」执行。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 样板默认审查工具 | 仍写 codex，注释指向指南那一节；安装提示要求 AI 换成本机已有的那个 | 样板里不写默认、留空让人填：照抄的人第一步就报错，测试也要跟着改 |
| 2 | 指南怎么教 | 以步骤为主，例子为辅：先说任何工具怎么配（找命令行、查 `--help` 里的无头和只读参数、写进配置、`check`），再列几种常见写法作例子，都标"没实测"，只有 codex 标实测过 | 只列一张工具表：表外的工具没人知道怎么配，工具参数一变表就过时 |
| 3 | 怎么说这种审查的局限 | 写明：新上下文、只读、真实验证命令这三样都有；写和审是同一个模型时盲点更可能重合，有两个工具时仍推荐换一个来审；工具没有只读开关时，运行时只兜得住改文件 | 不提：用户以为和跨工具审查一样可靠 |
| 4 | 没有命令行无头模式的工具 | 说清楚只能用[只用 Skill 和项目文件](../../../docs/guide/12-without-runtime.md)的方式，不能声称做过独立审查 | 做人工贴回的审查方式：多一种流程要维护，记录也证明不了贴回的是审查者原话 |
| 5 | `check` 查什么 | 每个 worker 的 `command`；命令是 `worker.sh <角色> -- <工具> …` 时再查 `--` 后面的工具（名字查 PATH，路径查文件能不能执行）。找不到记一行 `PROBLEM reviewer: codex is not on PATH; install and sign in to it, or put the AI command-line tool you have after "--" (docs/guide/04-adapter-guide.md)`，退出码 1 | 只打提示不算问题：送审照样每轮 `CANCELLED` |
| 6 | 代码规模和止损线 | `src` 不超过 8,400 行；审查上限 6 轮 | — |

## 验收

- `npm test && npm run check:docs && npm run test:envelope && npm run test:plugin && npm run test:pack-firstrun && npm run pack:check` 全过（本仓的验证命令）。
- 新测试：审查工具不在 PATH 时 `check` 打印上面那行并退出 1；工具在 PATH 上、或写的是存在的可执行文件路径时不报。
- 本工作的提交经本仓配置（codex）送审，没有未裁决的 P0/P1。
- 读 README 安装提示第 4 步和指南那一节，只有一个工具、而且不是 Codex 的人，知道该怎么配。

## 实施计划

1. 改 `check`，补测试。
2. 写指南那一节；改样板注释、快速开始、Skill、README 中英。
3. 提交，`buildbeat review` 送审。
4. 停在合并决定。

## 停止条件

- 审查 6 轮还有 P0/P1。
- `src` 超过 8,400 行还收不住。
