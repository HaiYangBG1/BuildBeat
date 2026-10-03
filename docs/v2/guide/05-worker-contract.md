# Worker 合同

[English](05-worker-contract.en.md)

builder/fixer 只修改允许的范围并提交候选；verifier 运行真实验收命令；reviewer 独立、只读，检查固定候选。

结构化输出：`{"status":"succeeded","findings":[{"severity": "P1", "summary": "具体问题"}]}`。severity 为 P0–P3，summary 为字符串；`P0` / `P1` 阻断并触发修复。只读步骤前后工作树变化会阻断结果。

reviewer 输入包含历史裁决 anchor 和可用的 lastReviewed 增量范围；fixer 输入包含本轮问题及裁决状态。提示词可以使用它们，不能自行批准。

环境缺工具、后端不可用、沙箱禁止必要操作等用 exit 75；不要通过修改业务代码掩盖环境问题。日志不得主动输出凭据。实际候选、退出码和证据都由内核回读，自述不能替代事实。

无效信封记为 `invalid-output`，属于环境故障，不能据此要求修改业务代码。

`BUILDBEAT_INPUT.workArtifact` carries the selected repository-relative `ref` and accepted `digest`. Read that artifact; use work.md first and legacy intent/plan only when work.md is absent.
