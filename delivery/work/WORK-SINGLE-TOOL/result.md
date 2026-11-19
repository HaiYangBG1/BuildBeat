# WORK-SINGLE-TOOL 结果

审查不再卡人：项目配置里不写 `workers.reviewer` 也能用，`review` 只跑验证、停到人的决定，状态、决定卡片和批准记录都写明没审查；要配审查的话，用手上任意一个能在命令行无头运行的 AI 工具另开一个只读会话就行；`check` 会报出配了却在本机找不到的审查工具。所有者批准的提交是 `040778e`，经 PR #136 以 merge commit `dbab4c3` 合入 `main`，还没发版。codex 只读审查 8 轮。

## 定了什么

- 没配审查者时，一轮只验证，记成单独的 `verify-only` 流程；停下的理由写 `verified; not reviewed: no workers.reviewer in the run config`。批准照常允许，批准记录里 `reviewed: false`。台账事件格式没动。
- 只验证的提交怎么批准，所有者选了「简单严格规则」：这项工作所有没驳回的 P0、P1 都要人先驳回，已经修好的也算。见 `review-findings.jsonl` 里所有者驳回的两条（`e2275f12160cbbdd`、`ac0816d0c4d90468`）。
- `check` 发现审查工具不在本机时记 PROBLEM 并退出 1，给两条改法：换成你有的工具，或删掉 `workers.reviewer` 只跑验证。命令是 `worker.sh` 或调用它的 shell 时，查 `--` 后面的工具。
- 样板仍默认 codex，注释说明换工具或先不配；文档不预设哪一家工具，只有 codex 标为实测过。
- 验证仍然必填；没有命令行无头模式的工具，可以先不配审查，或只用 Skill 和项目文件，都不能声称做过独立审查。

## 剩下什么

- `check` 认不出 `bash -oue pipefail …` 这类把 `o` 放在中间的合写选项，只影响提示，不影响送审。所有者驳回了这条（`65ad6d9605d25475`），说真碰到再另开工作修。
- 别的 AI 工具没有逐个实测，本仓的验证和审查照旧用 codex。
- 和 WORK-REVIEW-CIRCLING 的冲突在合并前解掉了（`CHANGELOG.md`、能力矩阵），合并结果跑过全套门禁。
- 发版等所有者另说。

## 写进了项目哪些文档

- SKILL.md @ 75f39fe — "写的不审"一条和配置一节：审查者可以是正在用的工具另开的无头会话；没配审查者就只验证并如实说明
- README.md @ 75f39fe — 安装提示第 4 步：用本机已有的 AI 命令行工具当审查者，或先不配
- README.en.md @ 0cdbb9e — 同上的英文版
- docs/guide/01-quickstart.md @ 75f39fe — 快速开始说明审查可以先不配
- docs/guide/01-quickstart.en.md @ 75f39fe — 同上的英文版
- docs/guide/02-workflow-guide.md @ 75f39fe — 一轮送审在没配审查者时只验证
- docs/guide/02-workflow-guide.en.md @ 75f39fe — 同上的英文版
- docs/guide/04-adapter-guide.md @ a1c5447 — 新增"只有一个 AI 工具，或者先不配审查"一节，以及只验证提交的批准规则
- docs/guide/04-adapter-guide.en.md @ a1c5447 — 同上的英文版
- templates/run-config.example.yaml @ 75f39fe — 审查命令注释：换成你有的工具，或删掉这一段先只验证
- docs/CAPABILITY-MATRIX.md @ 75f39fe — 审查一行说明可用同一工具无头审查、没配时只验证
- CHANGELOG.md @ 6991f9e — 未发布条目说明审查可选和 `check` 报缺失的工具
