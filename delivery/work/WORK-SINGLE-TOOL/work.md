# 只有一个 AI 工具也能用：审查者用手上那个工具另开一个只读会话

## 目标

很多人只装了一个 AI 编程工具，而且不一定是 Codex 或 Claude Code。做完后，这些人照 README 装 BuildBeat 不会卡在"要另一个 AI"上：

- 安装提示、Skill、样板和指南都说清楚：审查要的是另开一个没参与写代码的只读会话，用的可以就是你手上那个工具；不分是哪家的工具，只要它能在命令行里无头运行一次、把回答打到输出。
- 指南里有一张表：常见工具的无头只读写法，每行标明在本仓实测过还是没有。工具没有命令行无头模式时，说清楚只能用不带运行时的方式。
- `buildbeat check` 发现审查用的工具不在本机时直接报出来，并说怎么改，不用等送审后每轮都 `CANCELLED` 才发现。
- 本机装了的工具都用真实送审跑一次，跑通的写进能力矩阵。

## 起因

2026-11-18 所有者说：「当前buildbeat明确会要求有第二个agent，可能会卡主一些人，因为很多人可能只有一个？这种情况下怎么解决？」会话查过后答：不需要第二个产品，样板写死了 codex、文案写"另一个 AI"才会卡人。所有者说：「做成一项工作」。第一版说明拿 `claude -p` 当只有一个工具时的写法，所有者指出：「用户也不一定用的claude」。随后所有者说：「用WorkBuddy做测试」。

## 已核实的现状（2026-11-18，`4a62c92`）

**已确认**

- README 的安装提示第 4 步写"审查默认用本机已登录的另一个 AI 命令行工具"（`README.md:147-147`，英文 `README.en.md:147-147` 是 "another AI command-line tool"）。只有一个工具的人读到这里会以为装不了。
- 样板的审查命令是 `codex exec -s read-only`，换工具的写法只在一行注释里点了名字（`templates/run-config.example.yaml:38-48`）。
- `worker.sh` 把提示词作为最后一个参数交给工具、收它的标准输出（`templates/envelope/worker.sh:31-44`），所以任何"把提示词当参数、把回答打到输出"的命令行工具都能接；找不到工具时退出 75（`templates/envelope/worker.sh:26-29`），每一轮都记为 `CANCELLED`。
- 审查者动了检出里的文件，这一轮作废（`docs/guide/05-worker-contract.md:7-7`）。所以工具自己没有只读开关时，运行时这一层仍兜得住"改了文件"，兜不住它读 HOME 下的文件。
- `check` 只检查 `requires:` 里写明的命令（`src/cli/run.js:694-706`），不看审查命令里的工具在不在；样板的 `requires:` 只有 node（`templates/run-config.example.yaml:20-22`）。
- 能力矩阵写着真实 AI 审查只用 codex exec 跑过（`docs/CAPABILITY-MATRIX.md:23-24`）。
- Skill 已经说"审查者是另一个上下文里的只读 AI"（`SKILL.md:43-43`），配置一节没提只有一个工具时怎么配（`SKILL.md:61-65`）。
- 本机装了 `codex`、`claude`、`cursor-agent`、`gemini` 四个（`command -v`）；`copilot`、`qwen`、`opencode`、`aider` 没装。
- 本机装了 WorkBuddy 5.5.6（`/Applications/WorkBuddy.app`）。它的 App 包里自带一个命令行 `codebuddy` 2.137.1（`Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`），不在 PATH 上；参数和 `claude` 一样有 `-p`、`--tools`、`--allowedTools`、`--permission-mode dontAsk`（它的 `--help`）。用它跑审查提示词时报 401，要在这个命令行里单独 `/login`；报 401 时退出码是 0、输出为空，运行时会当成没交报告，这一轮 `CANCELLED`。
- 测试按样板里 `- codex` 四行做替换（`tests/templates-firstrun.test.js:87-92`、`tests/pack-firstrun.test.sh:125-134`），样板默认值改掉要连带改测试。
- `src` 现在 8,347 行（`find src -name '*.js' | xargs cat | wc -l`）。

**待核**

- 各工具的无头只读参数以它当时的 `--help` 为准，实现时逐个查。
- 本机 `claude -p` 报 401（OAuth 令牌失效），要所有者在终端重新登录；`cursor-agent`、`gemini` 是否已登录，实现时查。登录不了的就标"没实测"，不硬试。

## 范围

做：

- README 中英安装提示第 4 步改说法：审查用本机已有的 AI 命令行工具，可以就是你正在用的这个，另开一个无头只读会话。
- 样板 `run-config.example.yaml` 审查命令下的注释改成指向指南里的表，默认仍是 codex。
- 指南 `04-adapter-guide`（中英）加一节"只有一个 AI 工具"：原理、常见工具写法表（codex、claude、cursor-agent、gemini，再列 copilot、qwen 等常见的几个标"没实测"）、为什么这样也算独立、它弱在哪、没有命令行无头模式怎么办。快速开始（中英）配置示例后加一句指过去。
- Skill 配置一节加一句。
- `check` 检查每个 worker 实际要跑的工具在不在 PATH，不在记为 PROBLEM 并给改法；补测试。
- 实测以 WorkBuddy 为主：只装了 WorkBuddy 的人，照指南把审查者配成它自带的 `codebuddy`（写绝对路径或加进 PATH），真实送审本工作的提交。指南的表里写上 WorkBuddy 这一行和它命令行的位置。
- 本机其余能登录的工具也各跑一次，结果写进 result.md；跑通的写进能力矩阵。

不做：

- 不加 `init` 之类自动生成配置的命令；装的时候选哪个工具由按 README 安装的那个 AI 会话来定。
- 不做"人工把提示词贴进聊天窗口再贴回来"的审查方式；没有命令行无头模式的工具走不带运行时的方式。
- 不改本仓自己的 `delivery/run-config.yaml`。
- 不装本机没有的工具去测。不发版、不推送。

## 开工前待拍板

接受本说明即按「推荐」执行。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 样板默认审查工具 | 仍写 codex，注释指向指南里的表；安装提示要求 AI 换成本机已有的那个 | 样板里不写默认、留空让人填：照抄的人第一步就报错，测试也要跟着改 |
| 2 | 写法表放哪 | 只放在指南 `04-adapter-guide` 一处，样板、Skill、README 都指过去 | 样板里每种工具都写一段注释：样板变长，工具参数一变要改好几处 |
| 3 | 没实测的工具怎么写 | 照它 `--help` 写出写法，标"没实测"；能力矩阵只写实测通过的 | 只写实测过的：大多数人的工具不在表里，又卡住 |
| 4 | 怎么说这种审查的局限 | 指南里写明：新上下文、只读、真实验证命令这三样都有；写和审是同一个模型时盲点更可能重合，有两个工具时仍推荐换一个来审；工具没有只读开关时，运行时只兜得住改文件 | 不提：用户以为和跨工具审查一样可靠 |
| 5 | 没有命令行无头模式的工具 | 指南里说清楚只能用[只用 Skill 和项目文件](../../../docs/guide/12-without-runtime.md)的方式，不能声称做过独立审查 | 做人工贴回的审查方式：多一种流程要维护，记录也证明不了贴回的是审查者原话 |
| 6 | `check` 查什么 | 每个 worker 的 `command`；命令是 `worker.sh <角色> -- <工具> …` 时再查 `--` 后面的工具。不在 PATH 记一行 `PROBLEM reviewer: codex is not on PATH; install and sign in to it, or put the AI command-line tool you have after "--" (docs/guide/04-adapter-guide.md)`，退出码 1 | 只打提示不算问题：送审照样每轮 `CANCELLED` |
| 7 | 代码规模和止损线 | `src` 不超过 8,400 行；审查上限 6 轮 | — |

## 验收

- `npm test && npm run check:docs && npm run test:envelope && npm run test:plugin && npm run test:pack-firstrun && npm run pack:check` 全过（本仓的验证命令）。
- 新测试：审查工具不在 PATH 时 `check` 打印上面那行并退出 1；在 PATH 时不报。
- 用 WorkBuddy 自带的 `codebuddy` 按指南写法当审查者，对本工作的提交真实送审，交回能读的报告（不是 `CANCELLED`）。
- 本机其余能登录的工具同样各送审一次。命令与结果写进 result.md；指南的表和能力矩阵与这些结果一致。
- 读 README 安装提示第 4 步，只有一个工具、而且不是 Codex 或 Claude Code 的人，知道该怎么配。

## 实施计划

1. 改 `check`，补测试。
2. 查各工具 `--help`，写指南的表；改样板、快速开始、Skill、README 中英。
3. 提交，`buildbeat review` 送审（本仓配置，codex 审）。
4. 所有者在终端给 WorkBuddy 的命令行登录后，先把它换进工作自己的 `run-config.yaml` 当审查者送审；再把本机其余能登录的工具逐个换进去送审，确认交回报告；按结果改表和能力矩阵，提交、再送审一次。
5. 停在合并决定。

## 停止条件

- 某个工具跑起来改了检出里的文件或交不出 JSON：停下，把输出给所有者看，不硬调提示词。
- WorkBuddy 的命令行登录不上：停下说明，不拿别的工具顶替它的验收。
- 审查 6 轮还有 P0/P1。
