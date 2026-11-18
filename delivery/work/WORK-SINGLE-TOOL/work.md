# 只有一个 AI 工具也能用：审查者用本机已有的工具另开一个只读会话

## 目标

很多人只装了一个 AI 编程工具。做完后，这些人照 README 装 BuildBeat 不会再卡在"要另一个 AI"上：

- 安装提示、Skill、样板和指南都说清楚：审查要的是另开一个没参与写代码的只读会话，可以就是你正在用的那个工具；只有一个工具时怎么配，样板里有现成写法。
- `buildbeat check` 发现审查用的工具不在本机时直接报出来，并说怎么改，不用等送审后每轮都 `CANCELLED` 才发现。
- `claude -p` 当审查者用真实工具跑通一次，写进能力矩阵。

## 起因

2026-11-18 所有者说：「当前buildbeat明确会要求有第二个agent，可能会卡主一些人，因为很多人可能只有一个？这种情况下怎么解决？」会话查过后答：不需要第二个产品，样板写死了 codex、文案写"另一个 AI"才会卡人，并提了四件事。所有者说：「做成一项工作」。

## 已核实的现状（2026-11-18，`4a62c92`）

**已确认**

- README 的安装提示第 4 步写"审查默认用本机已登录的另一个 AI 命令行工具"（`README.md:147-147`，英文 `README.en.md:147-147` 是 "another AI command-line tool"）。只有一个工具的人读到这里会以为装不了。
- 样板的审查命令是 `codex exec -s read-only`，换工具的写法只在一行注释里点了名字（`templates/run-config.example.yaml:38-48`）。
- `worker.sh` 找不到 `--` 后面的工具时退出 75（`templates/envelope/worker.sh:26-29`），每一轮都记为 `CANCELLED`。
- `check` 只检查 `requires:` 里写明的命令（`src/cli/run.js:694-706`），不看审查命令里的工具在不在；样板的 `requires:` 只有 node（`templates/run-config.example.yaml:20-22`）。
- 能力矩阵写着真实 AI 审查只用 codex exec 跑过（`docs/CAPABILITY-MATRIX.md:23-24`）。
- Skill 已经说"审查者是另一个上下文里的只读 AI"（`SKILL.md:43-43`），配置一节没提只有一个工具时怎么配（`SKILL.md:61-65`）。
- `claude` 命令行支持 `--tools` 限定可用工具、`--allowedTools` 放行具体命令、`--permission-mode dontAsk` 不弹确认直接拒绝没放行的（本机 `claude --help`，2.1.289）。
- 测试按样板里 `- codex` 四行做替换（`tests/templates-firstrun.test.js:87-92`、`tests/pack-firstrun.test.sh:125-134`），样板默认值改掉要连带改测试。
- `src` 现在 8,347 行（`find src -name '*.js' | xargs cat | wc -l`）。

**待核**

- 本机 `claude -p` 在临时仓库里跑审查提示词时报 401（OAuth 令牌失效），还没证明它能交回合格的 JSON 报告。所有者在终端重新登录后实测；登录不了就停下说明，能力矩阵不写 claude。

## 范围

做：

- README 中英安装提示第 4 步改说法。
- 样板 `run-config.example.yaml` 在审查命令下加 `claude -p` 和 `cursor-agent -p` 两种写法（注释），默认仍是 codex。
- 指南 `04-adapter-guide`（中英）加一节"只有一个 AI 工具"：配置写法、为什么这样也算独立、它弱在哪。快速开始（中英）配置示例后加一句指过去。
- Skill 配置一节加一句。
- `check` 检查每个 worker 实际要跑的工具在不在 PATH，不在记为 PROBLEM 并给改法；补测试。
- 用真实 `claude -p` 跑一次本仓送审，结果写进 result.md 和能力矩阵。

不做：

- 不加 `init` 之类自动生成配置的命令；装的时候选哪个工具由按 README 安装的那个 AI 会话来定。
- 不改本仓自己的 `delivery/run-config.yaml`。
- 不验证 cursor-agent，能力矩阵不写它。
- 不发版、不推送。

## 开工前待拍板

接受本说明即按「推荐」执行。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 样板默认审查工具 | 仍写 codex，下面注释给 claude、cursor-agent 的现成写法；安装提示要求 AI 换成本机已有的那个 | 默认改成 claude：只有 codex 的人又卡住，测试也要跟着改 |
| 2 | 只有一个工具时审查者怎么配 | 同一个工具无头运行、只给读文件和 `git diff/log/show`、`printenv` 的权限：`claude -p --tools Read,Grep,Glob,Bash --allowedTools Read Grep Glob "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(printenv:*)" --permission-mode dontAsk` | 只用 `--permission-mode plan`：计划模式下它可能交一份计划而不是报告 |
| 3 | 怎么说这种审查的局限 | 指南里写明：新上下文、只读、真实验证命令这三样都有；写和审是同一个模型时盲点更可能重合，有两个工具时仍推荐换一个来审 | 不提：用户以为和跨工具审查一样可靠 |
| 4 | `check` 查什么 | 每个 worker 的 `command`；命令是 `worker.sh <角色> -- <工具> …` 时再查 `--` 后面的工具。不在 PATH 记一行 `PROBLEM reviewer: codex is not on PATH; sign in to it, or put an AI CLI you have after "--" (docs/guide/04-adapter-guide.md)`，退出码 1 | 只打提示不算问题：送审照样每轮 `CANCELLED` |
| 5 | 代码规模和止损线 | `src` 不超过 8,400 行；审查上限 6 轮 | — |

## 验收

- `npm test && npm run check:docs && npm run test:envelope && npm run test:plugin && npm run test:pack-firstrun && npm run pack:check` 全过（本仓的验证命令）。
- 新测试：审查工具不在 PATH 时 `check` 打印上面那行并退出 1；在 PATH 时不报。
- 用 `claude -p` 写法当审查者，对本工作的提交真实送审一次，交回能读的报告（不是 `CANCELLED`）。命令与结果写进 result.md。
- 读 README 安装提示第 4 步，只有一个工具的人知道该怎么配。

## 实施计划

1. 改 `check`，补测试。
2. 改样板、指南、快速开始、Skill、README 中英。
3. 提交，`buildbeat review` 送审（本仓配置，codex 审）。
4. 所有者重新登录 `claude` 后，用工作自己的 `run-config.yaml` 把 reviewer 换成 `claude -p` 写法再送审一次，确认交回报告；通过后改能力矩阵。
5. 停在合并决定。

## 停止条件

- `claude` 登录修不好：停下说明，第 4 步不做，能力矩阵不改。
- `claude -p` 跑起来改了检出里的文件或交不出 JSON：停下，把输出给所有者看，不硬调提示词。
- 审查 6 轮还有 P0/P1。
