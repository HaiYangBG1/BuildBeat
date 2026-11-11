# README 的流程图不再画运行时自己修代码

## 目标

README 里"记录是干活时顺手留下的"那张流程图，还把"实现"和"修复"画成流程里和"验证""审查"并列的自动步骤，最后一步写"批准绑定候选"。运行时已经不写代码、不修代码：代码是会话写、会话改，再把新提交送审。图和文字对不上，新来的人会以为还有自动修复。

做完后这张图说的是现在的事：会话写代码并提交，运行时验证、请只读的 AI 审查，有问题由会话改好、用新提交再送，最后你批准这个提交。

## 起因

WORK-CLEAN-START 的工作说明写明不包含 README 的配图，结果页把"发版前换图"列为遗留。2026-11-11 所有者说「准备发 6.0.0」。

- follows: WORK-CLEAN-START

## 已核实的现状（2026-11-11，`4e916a6`）

**已确认**

- 图由 `docs/assets/readme/diagrams.mjs` 画成 SVG，加 `--png` 时用本机的无头 Chrome 导出 PNG；每张图有中英文、明暗、宽窄共 8 个版本，README 引用的是 PNG。
- 流程图的文字在 `docs/assets/readme/diagrams.mjs:31-39`：节点"实现 / 写代码 · 提交"、回路"修复 / 有问题：修复 → 重验 → 再审"、最后一个节点"批准绑定候选"、底栏"每轮运行的终态记录"。英文同样。
- 交接那张图的英文写着 "each run"（`docs/assets/readme/diagrams.mjs:205`）。
- "看证据"那张图写的是"1 个问题已修、重新测过"（`docs/assets/readme/diagrams.mjs:262`），说的是结果，没说谁修，不用改。
- 首图 `docs/assets/readme/hero.jpg` 是一张画，不是脚本生成的；README 里它的替代文字写着"实现、验证、审查、修复、拍板五个音符"。
- README 中英文里流程图的替代文字写着"交付循环……审查有问题就修复、重验、再审"。

## 范围

做：改流程图和交接图的文字，重新生成这两张图的 16 个 SVG 和 16 个 PNG；改 README 中英文里这两张图和首图的替代文字。

不做：不重画首图（它是一张画，五个音符的说法改替代文字即可）；不改图的版式和配色；不改 README 正文。

## 开工前待拍板

所有者已说准备发版，下面按推荐做；要改哪项直接说。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 流程图的文字（中文） | 第二个节点"会话实现 / 写代码 · 提交"；回路"会话修改 / 有问题：改好，新提交再送审"；最后一个节点"你来拍板 / 批准绑定这个提交"；底栏"演奏过的乐谱留在 Git：work.md · 决定 · 审查问题 · 每轮审查的记录" | 把"实现"和回路从图里拿掉：图上就看不出代码是谁写的、有问题怎么办 |
| 2 | 流程图的文字（英文） | "Session builds / code · commit"；"Session revises / findings: fix, send the new commit"；"You decide / bound to this commit"；底栏 "The played score stays in Git: work.md · decisions · findings · each review's record" | — |
| 3 | 首图的替代文字 | 中文"五线谱上依次排着实现、验证、审查、修改、拍板五个音符……"；英文把 fix 换成 revise | 不改：图上本来就没有字，替代文字说"修复"会让人想到自动修复 |

## 验收

机器检查，过全套门禁：`npm test`、`npm run check:docs`、`npm run test:envelope`、`npm run test:plugin`、`npm run test:pack-firstrun`、`npm run pack:check`。另外：

- `node docs/assets/readme/diagrams.mjs --png loop handoff` 跑完，没有"text that may not fit its box"的提示。
- `git grep -n "候选\|修复 →\|bound to the candidate\|each run" -- docs/assets/readme/diagrams.mjs docs/assets/readme/loop-*.svg docs/assets/readme/handoff-*.svg` 没有结果。
- 除 loop 和 handoff 两组外，其他图的文件没有变化。

由人确认：所有者看一眼新图（中文宽版和窄版各一张）。

## 实施计划

1. 改 `diagrams.mjs` 的文字，生成 SVG 和 PNG，看有没有文字放不下。
2. 改 README 中英文的三处替代文字。
3. 跑门禁，送审。

## 停止条件

- 新文字在窄版里放不下，要改版式才行。
- 本机 Chrome 导不出 PNG。
