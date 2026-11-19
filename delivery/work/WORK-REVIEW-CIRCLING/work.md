# 审查连续几轮都审出阻断问题时，停下来找人

## 目标

一项工作送审后审出 P0/P1，会话修好再送，又审出新的，这样一直转下去，没有东西喊停。做完后：连续 5 轮审查都审出阻断问题时，`review` 的输出明确叫会话先别接着修、把情况拿给用户看；`status --work` 显示已经连续几轮；Skill 把它列进"找用户"的几处之一。用户说继续，就再修，满 10 轮、15 轮时再各问一次。

## 起因

2026-11-19 所有者发现另一个项目里一项工作送审了 108 轮：前几轮是正常修问题，之后几十轮都在同一个解析函数上，每轮审查编一句新的输入把它弄错，会话改一处正则，下一轮又出新的，后面不少问题写着"上一版本能正确处理"。会话一直没停，因为每条问题都"能再改代码"，从没走到要人裁决那一步。所有者看完说：「加上这条规则」。

- related: WORK-CLEAN-START
- related: WORK-REVIEW-CONVERGENCE

## 已核实的现状（2026-11-19，`4a62c92`）

**已确认**

- 6.0 删掉了修复循环、它的收敛判断和预算：`CHANGELOG.md:15`。现在一轮审查就是一次 `review`，轮与轮之间运行时不做判断。
- `review` 审完只打印这一轮的状态和下一步命令，不看这项工作之前审过几轮：`src/cli/run.js:522-613`，下一步命令在 `src/runtime/hints.js:19-48`。
- `status --work` 显示 `cost: review rounds <n> · findings <m>`，是累计数，看不出是不是一直审不过：`src/runtime/overview.js:579-583`，算法在 `src/runtime/work-cost.js:98-131`。
- 每轮审完都留下一条 `kind: review` 的证据，审出 P0/P1 时状态是 `failed`，否则 `passed`：`src/runtime/orchestrator.js:541-557`。台账状态和运行记录 `run-record.json` 的 `evidence` 里都有这条证据，台账被清掉时运行记录还在。
- Skill 写的"找用户只在这几处"是四处：工作说明要确认、审完等拍板、问题要裁决、环境坏了：`SKILL.md:37`。
- 本仓已有工作的审查轮数：大多 1 到 3 轮，最多的 WORK-READER-TEST 8 轮；那项工作的会话教训是"审查上限到了要停下问所有者"，两次加轮都是所有者明说的（数自 `delivery/work/*/runs/`）。

## 范围

做：

- 算一项工作最近连续几轮审查审出了阻断问题。
- `review` 审完、这个数是 5 的倍数时，打印一行 `stop:`，说已经连续几轮、建议先停下问用户；`status --work` 的文字和 `--json` 带上这个数。
- `SKILL.md` 和指南里写上这条规则；CHANGELOG 未发布条目加一句。

不做：不拦送审，不加配置键，不改台账、问题账和运行记录的格式，不判断问题之间像不像。

## 开工前待拍板

所有者已明说要加，下面按推荐做；要改哪项直接说。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 什么算"打转" | 这项工作按时间排的审查里，最后连着几轮的审查证据都是 `failed`。验证没过、工具故障没审到的轮次跳过，不算也不清零；有一轮审完没有阻断问题就清零 | 按总轮数算：一项大工作前几轮正常修问题，修好以后仍会被拦下来问 |
| 2 | 到数了怎么办 | 只提示不拦：`review` 打印 `stop: <n> reviews in a row found blocking problems; ...`，Skill 规定看到就停下找用户 | 到数拒绝送审、加参数才放行：参数会话自己就能加，拦不住；6.0 刚删掉预算这道墙 |
| 3 | 用户说继续以后 | 满 5 的倍数再提示一次（5、10、15……）；中间几轮 `status --work` 仍显示连续轮数，`review` 不再打印 `stop:` | 之后每轮都提示：用户已经说了继续，还被一轮轮追问 |
| 4 | 门槛能不能改 | 固定 5，不加配置键 | 加配置键：多一个要懂的设置；本仓最多的一项 8 轮，5 轮问一次不算打扰 |
| 5 | 停下来跟用户说什么 | Skill 写：说清连续几轮、问题集中在哪、是不是在反复改同一处；请用户在缩小范围、裁决这些问题、继续修三者里选 | 只报轮数：用户看不出该怎么选 |

对外可见的文字原文：

- `review` 输出：`stop: <n> reviews in a row found blocking problems; before fixing again, show the user where they keep coming from and ask whether to narrow the work, rule on the findings, or keep fixing`
- `status --work` 文字：`  blocking streak: <n> reviews in a row found blocking problems`（只在 n ≥ 1 时显示）；`--json` 每行加 `blockingStreak`（数字，没审过时为 0）。

## 验收

机器检查，过全套门禁：`npm test`、`npm run check:docs`、`npm run test:envelope`、`npm run test:plugin`、`npm run test:pack-firstrun`、`npm run pack:check`。另外测试覆盖：

- 连续 4 轮审出 P1：`review` 输出没有 `stop:`；第 5 轮有，内容是上面的原文、数是 5。
- 第 6 到第 9 轮没有 `stop:`，第 10 轮有、数是 10；`status --work` 每轮都显示当前连续轮数，`--json` 的 `blockingStreak` 相同。
- 中间一轮验证失败没审到：不计入也不清零。
- 中间一轮审完没有阻断问题：清零，之后从 1 重新数。
- 台账删掉、只剩运行记录时，数相同。
- 没审过的工作：`status --work` 不显示这一行，`blockingStreak` 为 0。

由人确认：批准决定。

## 实施计划

1. `src/runtime/work-cost.js` 加一个函数，从台账或运行记录里按时间取每轮的审查证据，算最后连续 `failed` 的轮数。
2. `review` 审完调用它，5 的倍数时打印 `stop:`；总览行带上 `blockingStreak`，`status --work` 显示。
3. `SKILL.md` 的"一轮审查怎么收场"和"找用户只在这几处"、指南 02 写上规则；CHANGELOG 未发布条目。
4. 测试，送审。

## 停止条件

- 旧版本运行记录里取不出审查证据的状态或开始时间，算不出顺序。
- 要改台账、问题账或运行记录的格式。
- 和待合并的 WORK-SINGLE-TOOL 冲突到要改它已批准的行为。
