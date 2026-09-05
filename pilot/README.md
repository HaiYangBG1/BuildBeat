# M-1 人肉内核试点套件

> 属于 [BuildBeat v2 正式执行基线](../docs/V2-PLAN.md) 的里程碑 M-1；执行细则见 [迭代 01](../docs/V2-ITERATION-01.md)。
> `V2-D0=B` 已决定做 v2；M-1 不再回答“做不做”，只用真实证据决定哪些运行能力组装、哪些进入薄内核、是否需要完整内核。

## 唯一交付

M-1 交付 `V2-D2` 分叉决定：

- **(a) 完整内核**：组装态在关键运行能力上存在重复、不可由薄控制面修补的结构性缺口；
- **(b) 薄内核**：厂商 runtime + 薄脚本覆盖大部分可组装能力，BuildBeat 自研只保留 approval staleness、统一证据台账、policy/gate 检查器。

决定必须同时引用三轮真实任务数据和故障注入矩阵，不能只凭“感觉顺不顺”。

## 套件内容

| 文件 | 用途 |
|---|---|
| [`loop.sh`](loop.sh) | build→verify/accept→fix→强制只读 review；异常退出、基线假绿、oracle 修改和 reviewer 写入会阻断 |
| [`templates/intent.md`](templates/intent.md) | 问题、目标、非目标、范围与验收 |
| [`templates/plan.md`](templates/plan.md) | 修改清单、顺序、风险、双验证命令与回滚 |
| [`templates/protected-paths.txt`](templates/protected-paths.txt) | 机器保护的验收 oracle 路径，一行一个 |
| [`metrics.md`](metrics.md) | 真实任务、故障场景、能力覆盖率、卡点和最终分叉 |

## 每轮运行步骤

1. **选低风险真实工作项**：目标项目有稳定回归命令，并能准备一个针对本工作项的验收命令。
2. **建立隔离现场**：使用 `pilot/<工作项名>` 专用分支，最好再用独立 worktree；不在生产相关分支运行。
3. **先固定验收 oracle**：让 `ACCEPT_CMD` 在基线确定失败；oracle 由人或独立准备步骤完成，不交给 Builder/Fixer 修改。
4. **提交批准对象**：把 `intent.md`、`plan.md`、`protected-paths.txt` 和验收 oracle 提交到专用分支。脚本要求开跑前工作树连 untracked 都为空。
5. **移除危险能力**：不给 agent 生产凭据、发布凭据或不必要的网络/工具权限。提示词禁止不是机器安全边界。
6. **开跑**：

```bash
cd <目标项目根>
AGENT_CMD='claude -p' \
REVIEW_AGENT_CMD='claude -p' \
VERIFY_CMD='npm test' \
ACCEPT_CMD='npm test -- acceptance.test.js' \
  bash <BuildBeat仓库路径>/pilot/loop.sh pilot-work/<工作项名>
```

命令变量只支持简单 argv；需要管道、重定向或复杂环境变量时，先封装成仓库内可审查脚本，再把脚本路径作为命令。

7. **收口**：两类验证都绿后，脚本强制启动 fresh-context review，并比较审查前后工作区指纹；最终停在 `WAITING_HUMAN`，不 merge、不 push。
8. **随手记数据**：填写 [`metrics.md`](metrics.md)，每个卡点回答“若有内核，它应该做什么”。

## 度量边界

- **设计内，不计计划外介入**：确认 plan digest、最终合并决定。
- **计划外，要计数**：手改提示词、补证据、手切 Agent、脚本卡死、越 Scope、恢复丢状态、Reviewer 写工作区等。
- **脚本简陋**与**结构性缺口**分开记录；前者修 pilot，后者才进入内核需求。
- 分支不是自动回滚器。任何清理前先保留 evidence；专用 worktree/branch 只是把影响范围隔离开。

## 安全声明

脚本能本地强制：干净基线、固定批准工件、验收基线失败、oracle 不被修改、Adapter 退出码、Review 只读指纹。

脚本不能跨厂商统一强制：禁网、禁 push、禁部署、禁读取宿主凭据。这些能力若宿主无法剥离，本轮只能按 `ADVISORY` 运行，必须登记为结构性缺口，不得宣称“安全边界已验证”。

## 退出

三轮跑完或两周时间盒到期后，按 [`metrics.md`](metrics.md) 的预置算法形成 `V2-D2`，回写 [`V2-PLAN.md`](../docs/V2-PLAN.md) §8 与 [`V2-DECISIONS.md`](../docs/V2-DECISIONS.md)。
