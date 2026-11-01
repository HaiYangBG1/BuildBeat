# 复盘的两条轻量建议：结果

范围与对外文字见 [work.md](work.md)。驾驶会话写实现并以 `--adopt` 交接，verify 跑本地全量检查，review 是随包 4.0 reviewer 提示词的只读 codex。RUN-REPLAY-FOLLOWUPS-01 以 SUCCEEDED 结束，候选 `1cd1ecd` 已快进合入 `v2`。

## 交付

- 审查步骤退出 0 却没有把报告写进 `$BUILDBEAT_OUTPUT`：记为 `invalid-output`，按环境故障停在 `resume-review`，不派 fixer、不扣预算；原因写明报告该写到哪里，stdout 有内容时给出字节数。此前这一步记为成功、不记审查证据，直到批准合并时才被拦下。
- 成本行把 human waits 按结束方式分开：`human waits N (decided … · superseded … · stopped … · open …)`，只列出现过的去向；JSON 带 `cost.waits`（每类 `{count, ms}`），run-record 一并保存；旧 run-record 没有该字段时不计时长。

## 过程

| 轮次 | 发现 | 处理 |
|---|---|---|
| 1 | 1 P1 | 同一决定在得到决定前被重复请求时，实现从第一次请求算起、只记一段；审查认为应按每次请求各算一段（共 15 分钟）。所有者决定按真实等待时间算（重叠时间不重复计入），驳回该条；代码注释、测试与 CHANGELOG 写明这条规则（`1cd1ecd`，行为不变）。依据：真实 216 个 Run 中 16 个出现过这种重复请求，共 26 次，都是续跑后对同一待决定的再次请求 |
| 2 | 0 | 进入合并决定，以 `--candidate 1cd1ecd` 批准 |

## 验证

- `verify.sh` 两次均通过：Node 回归 349 项、文档检查、Bash 信封、Claude 插件、安装后首跑、Work 范围 `git diff --check`。
- 新增 6 项回归中，5 项在改动前的代码上失败；另 1 项（交了空报告的审查照常通过）是对照。
- 原先依赖"干净审查不交报告"的测试夹具改为交空报告；逐字比对本地 JSON 的测试从输出取随时间变化的 open 等待，其余照旧逐字比较。
- 人工对照 4.2.0：试点工作区与另一工作区共 6 个仓的单仓 `status` 只有成本行变化；其中一项工作显示 `human waits 5 (decided 32m · superseded 11h25m)`，与复盘报告算出的已决等待约 32 分钟、被替代前等待约 685 分钟一致。
