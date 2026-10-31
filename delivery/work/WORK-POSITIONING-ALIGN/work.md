# 查需求的输出写上谁拍的板，插件介绍跟上新定位

## 目标

README 换了新定位（基于 Git 的项目上下文管理）以后，有两处产品说的话还跟不上：

1. 第④条卖点说「指着一行代码，查出它是为哪项需求写的、当时定了什么」，配图上写着「拍板：批准 · 你 · 时间」。但 `buildbeat history --path` 现在只列出工作的阶段、标题、结论和要读的文件，没写这段代码是谁、什么时候批准合并的，也没写谁关的窗。要知道还得再跑一次 `status --work` 翻决定列表。
2. Claude Code 插件和插件市场的介绍还是旧说法：以「换会话、交付循环」为中心，还写着「Install the runtime separately」，像是不装运行时就不能用；而 WORK-TEAM-ENTRY 之后，只用 Skill 和项目文件已经是完整的用法。

做完后，`history --path` 每项工作多一两行，写明谁、什么时候批准了进主干的那一版，谁、什么时候关的窗；插件和插件市场的介绍用新定位、说明运行时可选。

## 起因

2026-10-31，README 改版（PR #101，main `8fd2bc0`）合入后，所有者问「功能要不要改」，会话核对五条卖点和现有功能后建议只补这两处，所有者说「改吧」。

- follows: WORK-CODE-TRACE
- related: WORK-TEAM-ENTRY

## 已核实的现状（2026-10-31，main `8fd2bc0`）

**代码已确认**

- `src/v2/runtime/code-trace.js:199-217`（`workFacts`）：每项工作只取阶段、标题、已关窗时的结论和要读的文件；`computeOverview` 返回的行里已有 `decisions`、`mergedCandidate`，没有用到。
- `src/v2/runtime/code-trace.js:307-329`（`renderTrace`）：每项工作一行标题，下面只有 `result:` 和 `read:` 两行。
- `src/v2/runtime/overview.js:279-286`：进了主干的那一轮（`mergedRun`）是候选落在主干上的最近一轮，`mergedCandidate` 是它的候选。
- `src/v2/runtime/overview.js:296-298`：关窗是 `decisions.jsonl` 里最近一条 `close-work`。
- `src/v2/runtime/actor.js:115-122`（`describeActor`）：决定行的「人还是 AI 会话」说法，`status --work` 的决定列表用的就是它；没记身份的老记录写 `identity not recorded`。
- 合并批准在每项工作的决定记录（decisions.jsonl）里是 `transition: "enter-wait-merge"`、`decision: "approved"`，`subject.candidate` 是批准时绑定的候选（本仓 WORK-THREADS、WORK-FACT-DIR-POINTERS 的记录都是这样）。修复后旧候选的批准失效，所以同一项工作可能有几条合并批准，只有绑定进主干那一版的那条才是「这段代码是谁批的」。
- `tests/v2-code-trace.test.js:74-98`：夹具里 WORK-FOLDER 有一条没记身份的关窗行，WORK-RUN 有两轮运行记录，没有合并批准行。

**插件文字**

- `plugins/buildbeat/.claude-plugin/plugin.json`：description 以 "Guides AI sessions through project context in files, handoffs … and BuildBeat delivery loops" 开头，以 "Runtime installed separately." 结尾。
- `.claude-plugin/marketplace.json`：市场 description 是 "context in project files and Git-based delivery across AI models, tools, sessions, and people"；插件条目结尾 "Install the runtime separately."。
- `plugins/buildbeat/README.md:3`：第一句是旧标语 "Switch sessions. Keep building."，其后以交付循环为中心。

## 范围

包含：

- `history --path` 每项工作加 `approved:` 和 `closed:`（或 `cancelled:`）两行，`--json` 每项加 `approved`、`closed` 两个字段（第 1、2 项）。
- `plugin.json`、`marketplace.json` 两处 description、插件 README 开头一段换成新定位（第 4 项）。
- CHANGELOG 新开 `## Unreleased`，记这两处变化。
- 回归测试。

不包含：

- `status` 的输出、决定行的格式、批准规则。
- README 第④条的配图：它是示意，日期写法不跟命令输出逐字对齐。
- 插件版本号、发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 显示哪一条合并批准 | 绑定进主干那一版候选的批准（`subject.candidate` 等于 `mergedCandidate`）；没有这样的记录就不显示 | 显示最近一条合并批准：可能是修复前、已经失效的那一版的批准，会张冠李戴 |
| 2 | 关窗要不要也显示 | 显示：只用 Skill 和项目文件的工作没有合并批准，关窗行就是它唯一的「谁拍的板」；取消的工作写 `cancelled:` | 只显示批准：只用文件的工作查出来一行拍板信息都没有 |
| 3 | 时间怎么写 | 照决定记录原样写 ISO 时间（和 `status --work` 的决定列表一致） | 写成本地短时间（`10-25 14:02`）：好看，但和 status 对不上，还要处理时区 |
| 4 | 插件文字 | 按下面「对外名字」的原文 | 只删 "Install the runtime separately"：改动小，但介绍仍以交付循环为中心，和 README、About 说法不一 |

**对外名字（接受即确认）**

- 文本输出，每项工作标题行下面、`result:` 上面，有记录才出现：
  - `    approved: <ts> by <who> (<RUN-ID>)`
  - `    closed: <ts> by <who>`；取消的工作写 `    cancelled: <ts> by <who>`
  - `<who>` 是 `describeActor` 的说法，比如 `HaiYangBG1 (person, entered from an AI session)`、`claude-code (AI session)`、`owner (identity not recorded)`。
- `--json` 每项工作加 `approved: {at, by, who, run, decisionRef} | null` 和 `closed: {at, by, who, decision, decisionRef} | null`（`decision` 为 `closed` 或 `cancelled`）。
- `plugins/buildbeat/.claude-plugin/plugin.json` description：
  > Git-based project context management for Claude Code: keeps why each piece of work was done, what was decided and where it stands in the project with the code. The runtime, which adds the build-test-review loop and its checks, is optional.
- `.claude-plugin/marketplace.json` 市场 description：
  > Official BuildBeat plugins: Git-based project context management, with each piece of work's context kept in Git next to the code.
- 插件条目 description：
  > Git-based project context management for people and AI sessions: each piece of work's goal, decisions and progress live in the project with the code, so any session, tool or person can carry on. The runtime is optional.
- `plugins/buildbeat/README.md` 第一段：
  > Git-based project context management. This plugin guides people and AI sessions to keep why each piece of work was done, what was decided and where it stands in the project's Git, next to the code, so any session, tool or person can carry on. With the optional runtime, BuildBeat also builds, tests, reviews and fixes the change, then stops for a human decision.
- CHANGELOG `## Unreleased` 两条（英文，和 5.0.0 条目同一写法），编号标 WORK-POSITIONING-ALIGN。

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`（起点 `8fd2bc0`）。
- `tests/v2-code-trace.test.js` 新增测试，夹具里给一项工作写两条合并批准：一条绑定进主干那一版候选（人，记了身份），一条绑定另一版候选（AI 会话）：
  - 文本只出现绑定进主干那一条的 `approved:` 行，`<who>` 是 `(person)` 的说法，括号里是那一轮的编号；`--json` 的 `approved` 字段与之一致。
  - WORK-FOLDER 那条没记身份的关窗行显示为 `    closed: 2026-10-02T00:00:00Z by owner (identity not recorded)`，`--json` 的 `closed.decision` 为 `closed`。
  - 取消的工作显示 `cancelled:`。
  - 没有批准、没有关窗的工作两个字段都是 `null`，文本不多出行。
  - 新测试在现在的代码上失败（驱动会话交 Run 前确认并写进 notes.md）。
- 已有测试的断言一条不改照样通过。
- 插件市场测试（`npm run test:plugin`）照样通过。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 插件文字读起来顺不顺：合并前所有者看一眼原文。

## 实施计划

1. `src/v2/runtime/code-trace.js`：`workFacts` 从 `computeOverview` 的行里取 `decisions` 和 `mergedCandidate`，再读该工作的 `decisions.jsonl` 拿 `subject.candidate`，找出绑定 `mergedCandidate` 的最近一条合并批准和最近一条 `close-work`；`renderTrace` 加两行；开头注释补一句。
2. 测试：夹具加批准行和一项取消的工作，新增上面的测试。
3. 插件三处文字按原文改；CHANGELOG 新开 `## Unreleased`。

驾驶会话亲自写代码，提交带 `Work: WORK-POSITIONING-ALIGN`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。

## 停止条件

- 已有测试的断言要改（说明行为改到了范围以外），先停下来问。
- 发现合并批准的记录形状和上面写的不一样（比如老记录没有 `subject.candidate`，又确实需要显示），先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
