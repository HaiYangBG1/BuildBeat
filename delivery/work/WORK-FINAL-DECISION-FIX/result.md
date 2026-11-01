# 合并决定点能接修复：结果

范围与对外名字见 [work.md](work.md)；所有者 2026-10-07 另确认保留合并批准的 `--candidate <sha>`（第 2 轮审查的两条 P2 据此驳回）。builder 与 fixer 是 codex worker（随包 4.0 提示词），verify 跑本地全量检查，review 是三路并行只读 codex。RUN-FINAL-DECISION-FIX-01 以 SUCCEEDED 结束，候选 `a51b718` 以合并提交合入 `v2`（`v2` 在本 Work 进行中随 4.1.0 发布前进）。

## 交付

- 合并决定点接纳手工修复：沿用 `run --adopt`；要求工作树干净、HEAD 读回、新提交是当前候选的后代、改动不越界；从 verify 继续，经 review 回到合并决定。
- 合并决定点退回给修复者：`decide --action fix --reason <要修什么>`，仅在配有 fixer 时可用；原因记为已接受的 P1 交给 fixer，之后 verify、review，回到合并决定。
- 合并批准带 `--candidate <sha>`：状态卡、待批列表与通知自动填入；修复过的 Run 不带或带旧候选的批准报"批准已过期"。
- Skill 与审批、恢复指南（中英）写明这些需要运行时 4.2 或更高版本，文档检查守住这一点。

## 过程

| 轮次 | 发现 | 处理 |
|---|---|---|
| 1 | 6 P1 + 2 P2 | 修复后的 Run 无法经 CLI 批准、候选仍是 base 时两条入口被拒、文档与版本限定、测试绕过 CLI 批准、fixture 继承宿主 git 配置；codex fixer 一次修完 |
| 2 | 2 P2 | 新参数 `--candidate` 不在对外名字表：所有者确认保留，驳回 |
| — | 人工退回 | 所有者让用本 Work 自己的运行时（冻结的 `7e215f2`）执行 `decide --action fix`：文档里写死"尚未发布"的说法与检查会卡住发布，改为"运行时 4.2 或更高版本"；fixer 1 分钟完成 |
| 3 | 0 | 回到合并决定 |

裁决与决定全文见 [review-findings.jsonl](review-findings.jsonl) 与 [decisions.jsonl](decisions.jsonl)。worker 计时 29 分钟。

## 验证

- `verify.sh` 第 3 次通过：Node 回归 343 项、文档检查、Bash 信封、Claude 插件、安装后首跑、Work 范围 `git diff --check`。
- 合并前人工核对：试点工作区与另一工作区共 5 个仓的单仓 `status` 与 4.1.0 零差异；在本 Run 的真实台账上，用旧候选 `7e215f2` 或不带 `--candidate` 的批准都报"批准已过期"，台账行数不变；`decide --action fix` 在本 Run 上首次真实使用，走完 fix、verify、review 回到合并决定；最终以 `--candidate a51b718` 批准。
