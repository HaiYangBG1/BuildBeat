# 复盘的两条轻量建议：审查没交报告当场停、成本里分开等待

## 目标

2026-10-07 对试点工作区 4.0 发布后真实 Run 的复盘提出两条可直接做的改进：

1. **审查没交报告时当场停下。** 审查步骤正常退出（退出码 0）却没有把报告写进 `$BUILDBEAT_OUTPUT` 时，内核现在把这一步记为成功：不记审查证据、不派 fixer，直到批准合并时才因"缺审查证据"被拦下。真实事故：一次审查的结果只打印在 stdout，13 条问题（其中 3 条 P1）没有进入机器判断。改为当场按环境故障（`invalid-output`）停人，不扣预算、不派 fixer，原因写明报告应写到哪里。
2. **成本里分开等待的去向。** `status` 的成本行现在只有"human waits N"这个次数。等了多久、最后是有人决定、被新 Run 替代、被停掉，还是还在等，都看不出来。真实数据：一项工作的已决等待只有 32 分钟，被新 Run 替代前的等待却有 11 小时 20 分钟，只看次数会严重低估。改为按去向分别给出等待时长。

## 待所有者确认的对外文字（接受本说明即确认）

| 项 | 提议 |
|---|---|
| 成本行 | `human waits N (decided 32m · superseded 11h21m · stopped 5m · open 4m)`：只列有次数的去向；没有可算的时长时保持原样 `human waits N` |
| 成本 JSON | `cost.waits`：`{decided, superseded, stopped, open}`，每项 `{count, ms}` |
| 审查没交报告的停人原因 | `worker infrastructure failure at review: the reviewer exited 0 without writing a report to $BUILDBEAT_OUTPUT (stdout is not read)`；stdout 里有内容时加一句 `stdout has N bytes; write the JSON report to $BUILDBEAT_OUTPUT` |

## 范围

包含：运行时（审查步骤的结果判定、等待时长的计算与成本行显示，run-record 的 cost 块随之带上）、对应回归测试、Worker 合同中英两篇的一句说明、CHANGELOG `Unreleased`。

不包含：非审查步骤的输出要求（build、verify、fix 照旧只看退出码）、通知、统计口径以外的状态输出、发布。

## 行为要点

### 1. 审查没交报告

- 只针对审查步骤（`review` 或由 reviewer worker 执行的步骤）：退出码 0、没有超时、没有崩溃，但既没有适配器返回的报告、也没有 `$BUILDBEAT_OUTPUT` 文件时，记为 `invalid-output`，按现有环境故障规则处理：不派 fixer、不扣预算、停在 `resume-review` 等人。
- `STEP_FINISHED` 带上原因；停人原因用上表文字。
- 报告文件存在但内容为空或不是 JSON 的情况保持现状（已经是 `invalid-output`）。审查退出码非 0 的情况保持现状。

### 2. 等待去向

- 每次 `HUMAN_REQUESTED` 算一段等待，按结束方式归类：随后出现 `DECISION_RECORDED` 为 decided；Run 以 SUPERSEDED 结束且没有决定为 superseded；以其他终态结束且没有决定为 stopped；Run 仍在等待为 open（算到现在）。
- Work 级成本把所有 Run 的各类时长相加；运行时已删、只剩 run-record 的 Run，按其 cost 块里的 `waits` 计入，旧记录没有该字段时不计入时长、次数照旧。

## 验收

- `verify.sh` 全过：Node 回归、文档检查、Bash 信封、Claude 插件、安装后首跑、本 Work 范围内 `git diff --check`。
- 回归测试覆盖：审查退出 0 且没写报告时停在 `resume-review`、`STEP_FINISHED` 为 `invalid-output` 且带原因、没有审查证据、没有派 fixer、预算未扣；stdout 有内容时原因里有提示；正常交报告的审查不受影响。等待：decided、superseded、stopped、open 四类时长各自正确；成本行只列有次数的去向；run-record 的 cost 块带 `waits`；旧 run-record 没有该字段时不出错。
- 独立只读审查无未裁决的 P0/P1。

## 实施计划

1. orchestrator：审查步骤缺报告时判 `invalid-output` 并写原因，停人文字用上表。
2. work-cost：`ledgerCost` 计算四类等待（open 需要当前时间），`computeWorkCost` 汇总，`renderWorkCost` 显示。
3. 回归测试；Worker 合同中英各补一句；CHANGELOG。

## 止损

范围变化需要新的决定。审查轮数上限 6 轮（run-config `budgets.reviewRoundsPerWork`）。
