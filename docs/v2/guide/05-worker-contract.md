# Worker 合同

权威：[`RFC-0003 §5`](../RFC-0003-workflow-policy.md)（报告 B §8.1）。Worker 是可替换的执行者；合同的另一半永远由 Runner 物理保证，不依赖 Worker 自觉。

## 通用合同

- **输入**：环境变量 `BUILDBEAT_INPUT`（JSON）：step、worker、run/work id、candidate（如已固定）、允许范围；
- **输出**：需要结构化结论的步把 JSON 信封写到 `BUILDBEAT_OUTPUT` 指向的文件：

```json
{"status": "succeeded", "findings": []}
```

  - `status`: `succeeded` | `failed` | `blocked`；
  - `findings[]`: `{severity: "P1|P2|P3", title, detail?}`——`P1/P2` 会触发 `findings-blocking` 路由进 fix；
  - 信封外多裹一层 markdown 代码栏（```json … ```）可容忍，其余任何格式=`invalid-output`，按失败处理；
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

## 实践提示

- prompt 里明确引用 `delivery/work/<id>/plan.md`，让 Worker 的目标与被批准的 digest 是同一份文件；
- builder 的提交动作可以由包装脚本机械执行（M4 试点即如此：codex 只改文件，`git commit` 在包装层）；
- reviewer 的 prompt 要求"只输出信封 JSON"，并用 `-o`/重定向落到 `$BUILDBEAT_OUTPUT`。
