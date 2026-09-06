# Worker 合同

权威：[`RFC-0003 §5`](../RFC-0003-workflow-policy.md)（报告 B §8.1）。Worker 是可替换的执行者；合同的另一半永远由 Runner 物理保证，不依赖 Worker 自觉。

## 通用合同

- **输入**：环境变量 `BUILDBEAT_INPUT`（JSON）：step、worker、run/work id、candidate（如已固定）、允许范围；
- **输出**：需要结构化结论的步把 JSON 信封写到 `BUILDBEAT_OUTPUT` 指向的文件。最小合法示例（与 `src/v2/runtime/orchestrator.js` 的解析器一致，回归测试 `tests/v2-review-loop.test.js`）：

```json
{
  "status": "succeeded",
  "findings": [
    {"severity": "P1", "summary": "日期筛选未覆盖结束日期边界，导致当天记录被遗漏。"}
  ]
}
```

  - `status`: `succeeded` | `failed` | `blocked`；
  - `findings[]`（可省，省略等于空数组）：每条**必须**有 `severity`（`P0` | `P1` | `P2` | `P3`）和字符串 `summary`；其他字段被忽略、不落账。finding 指纹 = 严重度 + `summary` 规范化 hash，所以 `summary` 要稳定、可复述，不要带时间戳或随机 id；
  - **阻断语义**：`P0` / `P1` 阻断——`findings-blocking` 路由进 fix（`reviewTriage: required` 时先停人分诊）；`P2` / `P3` 只落 Evidence，不阻断、不派 fixer；已 `dismiss` 的同指纹不再阻断（[Approval 指南](07-approval-guide.md)）；
  - **格式错误不是候选缺陷**：信封外多裹一层 markdown 代码栏（```json … ```）可容忍；其余任何格式（非 JSON、不是对象、finding 缺 `summary`、severity 不在 P0–P3）= `invalid-output`，2.0.0-beta.5 起内核判为 worker 基础设施故障（kind `infra`）：不派 fixer、不记失败指纹、不扣预算，停 `WAITING_HUMAN`；人修好 worker 或环境后 `approve --transition resume-<step>` 续跑；
- **Worker 说的不算证据**：Runner 只相信自己回读的事实（退出码、日志、git 状态）；见 [Evidence 指南](06-evidence-guide.md)。

## 各角色纪律

| 角色 | 写权限 | 合同要点 |
|---|---|---|
| planner | 工作项目录 | 产出 intent/plan 草稿；接受与否是人的 digest 绑定动作 |
| builder | 隔离 worktree（`allowedPaths` 内） | 改动必须落成 git 提交；越界写入 = Run BLOCK，不固定 candidate |
| verifier | 只跑命令 | 跑真实测试；退出码就是结论，不写信封 |
| fixer | 同 builder | 输入必含失败命令/退出码/日志摘要/candidate/允许范围；不接受泛化的"再检查一下" |
| reviewer | **无**（`readonly: true`） | fresh-context 只读；产出结构化 findings；任何工作树写入由快照比对捕获并按失败落账（不变量 9） |

## 失败与预算

同一步失败会带着**失败指纹**（命令+退出码+错误摘要+diff digest）重试；连续同指纹或超 `maxAttemptsPerStep`/预算即停，转人工。Worker 不需要（也不能）自己决定"再试一次"。

**没配 fixer 不等于自动修复**：run 配置 `workers:` 里缺某个角色（常见是 `fixer`），Run 走到该步时不会报错也不会跳过，而是停 `WAITING_HUMAN`（`enter-fix`，理由 `no adapter configured for worker fixer; attended handoff`）等人接手。想要"测试失败后自动修"，必须配置 `fixer`（通常与 builder 同一条命令，prompt 从 `BUILDBEAT_INPUT` 读失败摘要），见 [快速开始](01-quickstart.md)。

## 实践提示

- prompt 里明确引用 `delivery/work/<id>/plan.md`，让 Worker 的目标与被批准的 digest 是同一份文件；
- builder 的提交动作可以由包装脚本机械执行（M4 试点即如此：codex 只改文件，`git commit` 在包装层）；
- reviewer 的 prompt 要求"只输出信封 JSON"，并用 `-o`/重定向落到 `$BUILDBEAT_OUTPUT`。

## 迭代 08：输入里多了什么

- `BUILDBEAT_PROMPT`（环境变量，文件路径）与 `input.envelope`（`promptRef / file / digest / vars`）：run 配置 `envelope:` 声明的 prompt 已由内核替换变量并落盘，worker 直接 `cat "$BUILDBEAT_PROMPT"`，不再自己 `git show`。
- `input.lastReviewed`（仅 readonly 步）：`{candidate, run, evidenceRef, range}`——上一次 review 看过的候选与到当前候选的 `range`；reviewer 可只审增量，但**已裁决结论不得翻案**（`anchor` 仍在）。
- `input.findings`（写入步）与 `input.anchor`（readonly 步）不变。

## 所有者可见命名不由 worker 决定（迭代 08）

builder / planner 在实现中会顺手起名：域名、服务名、环境名、自停时长、窗口时长。**凡所有者以后要看见或念出来的名字与参数，不是实现细节，是门前决策项**：写进 intent，或攒进门前决策卡给推荐值与理由，人批后再落地。真实事故：一个按内部术语起的服务名让所有者连问四轮才改成他听得懂的业务名。prompt 里写明这条，reviewer 清单里把"引入了未经批准的可见命名"记为 P2。
