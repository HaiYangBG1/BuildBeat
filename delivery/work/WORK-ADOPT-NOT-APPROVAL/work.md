# 合并决定点交回修复不再被当成合并批准

## 目标

Run 停在合并决定点时，会话手修后用 `run --adopt <sha>` 交回，Run 重验、再审，之后再等人批准合并。运行时把这次交回记成一行 `enter-wait-merge approved`（带 `adopted` 字段），`status` 就把它当成合并批准，提示"merge approved by an AI session, not by a person"，可人其实还没批。看进度的人会以为合并已经被 AI 自己批了。

做完后：

1. `status`（总览、`--work`、`--run`）判断"AI 会话自批合并"时跳过交回修复的那一行，只看真正的合并批准；交回之后没人批准时不提示，人批准后按真实批准人显示，AI 会话真的自批合并时照旧提示。
2. `history --path` 的 `approved:` 行同样只认真正的合并批准，不把交回修复当成批准。
3. 决定列表里交回修复的那一行写明是交回：`status --work` 的 `decisions:` 和 `status --run` 的 `decision …` 行末尾加 `— adopted <sha7>, resumed at verify`。

## 起因

2026-11-05 做 WORK-COMMITTED-WORKS 时，在合并决定点用 `--adopt` 交回修复后，`status` 提示 `note: merge approved by an AI session (claude-code, D-RUN-COMMITTED-WORKS-01-2), not by a person`，而所有者那时还没批准；所有者真正批准（`D-RUN-COMMITTED-WORKS-01-4`）后提示才消失。会话把它提成单独任务，所有者说「Do this task here」。

- related: WORK-APPROVAL-IDENTITY
- related: WORK-FINAL-DECISION-FIX
- related: WORK-COMMITTED-WORKS

## 已核实的现状（2026-11-05，会话分支 `4222b1c`）

**代码已确认**

- `src/v2/runtime/actor.js:104-110`（`selfMergeApproval`）：取最近一行 `transition === "enter-wait-merge" && decision === "approved"`，actor 是 AI 会话就返回它。不看 `adopted`。
- 交回修复在合并决定点记成 `decision: "approved"`、`transition: "enter-wait-merge"`，台账事件和 `decisions.jsonl` 都带 `adopted` 和 `resumeAt`：`src/v2/runtime/decisions.js:304`（`adoptCandidate`）、`:395`、`:408-412`。
- 批准命令自己已经区分交回：`src/v2/runtime/decisions.js:120-122` 把带 `adopted` 或 `decision: "fix"` 的行当成"修过"，要求批准绑定候选。
- 台账状态里的决定不带 `adopted`：`src/v2/engine/reducer.js:215-237` 只留 decision、transition、subject、decisionRef、actor。`status --run` 用它判断（`src/v2/cli/run.js:302-314`），`run-record.json` 也照抄（`src/v2/runtime/run-record.js:55`）。
- `status`/`status --work` 用 `decisions.jsonl` 拼出的决定行判断（`src/v2/runtime/overview.js:281-305`），拼的时候也没带 `adopted`。
- `history --path` 的批准人：`src/v2/runtime/code-trace.js:184-188`（`deciders`）按"候选等于进了主干那一版的 `enter-wait-merge approved`"找，同样不看 `adopted`。
- 已有测试 `tests/v2-approval-identity.test.js` 断言 AI 会话自批合并时三处都提示，`tests/v2-final-decision-fix.test.js` 覆盖合并决定点的交回；交回后的提示没有测试。

**真实例子**

- `delivery/work/WORK-COMMITTED-WORKS/decisions.jsonl` 的 `D-RUN-COMMITTED-WORKS-01-2`（带 `adopted`，AI 会话）。

## 范围

包含：

- `actor.js` 的 `selfMergeApproval` 跳过带 `adopted` 的行；`reducer.js` 的决定保留 `adopted`（只在交回的那行出现）；`overview.js` 拼决定行时带上 `adopted`；`code-trace.js` 的 `deciders` 跳过带 `adopted` 的行。
- 决定列表里交回那一行的说明。
- 回归测试；CHANGELOG `## Unreleased`。

不包含：

- 改交回时写的记录本身（仍写 `approved`，批准命令和重放都靠它）。
- 已有记录：不改写；新逻辑读到老记录里带 `adopted` 的行同样跳过。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 怎么认出交回 | 带 `adopted` 字段的 `enter-wait-merge approved` 行就是交回，判断"谁批准了合并"时跳过它，往前找 | 交回改记成别的 decision（比如 `adopted`）：要动批准命令、重放和已有记录的读法，改动大得多 |
| 2 | `status --run` 怎么拿到 `adopted` | 台账状态的决定只在交回那行多带 `adopted`；新 Run 的 `run-record.json` 也会多这个字段 | `status --run` 另外去翻台账事件：两套读法，容易再漏 |
| 3 | 决定列表要不要标出交回 | 标：`— adopted <sha7>, resumed at verify` | 不标：列表里仍是一行"approved by AI session"，读的人还是会误会 |

**对外名字（接受即确认）**

- 决定列表里交回那一行的结尾：` — adopted <sha7>, resumed at <step>`（`status --work` 的 `decisions:` 下，以及 `status --run` 的 `decision …` 行）。`status --work` 的行本来有 ` — <note>` 时，交回说明放在 note 前面。

## 验收

机器检查：

- `verify.sh` 全部通过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑，以及本工作范围内的 `git diff --check`（起点 `4222b1c`）。
- 新测试（放进 `tests/v2-approval-identity.test.js` 或 `tests/v2-final-decision-fix.test.js`，照现有写法）：
  - 合并决定点由 AI 会话 `--adopt` 交回、Run 重验重审后又停在合并决定：`status`、`status --work`、`status --run` 都没有 "merge approved by an AI session"，`--json` 没有 `selfMergeApproval`；两个决定列表里交回那一行带 `— adopted <sha7>, resumed at verify`。
  - 之后人批准：没有提示；AI 会话批准：照旧提示，指向那次批准的 decisionRef。
  - `history --path`：候选合并进主干后，`approved:` 指向真正的批准，不是交回那一行。
  - 新测试在现在的代码上失败（驾驶会话交 Run 前确认，写进 notes.md）。
- 已有测试的断言一条不改照样通过。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 无。

## 实施计划

1. `reducer.js`：DECISION_RECORDED 带上 `adopted`（有才带）。
2. `actor.js`：`selfMergeApproval` 跳过带 `adopted` 的行。
3. `overview.js`：决定行带 `adopted`、`resumeAt`；渲染时加交回说明。`run.js`：`status --run` 的决定行同样加。
4. `code-trace.js`：`deciders` 跳过带 `adopted` 的行。
5. 测试、CHANGELOG。

驾驶会话亲自写代码，提交带 `Work: WORK-ADOPT-NOT-APPROVAL`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。

## 停止条件

- 已有测试的断言要改：先停下来问。
- 发现还有别的地方把交回当成合并批准（比如合并门槛、发布回读），要改的范围比上面大：先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
