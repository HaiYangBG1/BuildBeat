# Workflow 编写指南

权威：[`RFC-0003 §2`](../RFC-0003-workflow-policy.md)；实现：`src/v2/engine/workflow.js`。官方预设 [`software-delivery.yaml`](../../../src/v2/presets/software-delivery.yaml) 是最好的范本。

## 形状

```yaml
kind: workflow
version: 1
name: software-delivery
entry: intent
steps:
  - id: build
    worker: builder
  - id: review
    worker: reviewer
    readonly: true
  - id: wait-merge
transitions:
  - from: verify
    on: failed
    to: fix
terminal:
  - wait-merge
```

## 规则（加载期 fail-closed 校验）

1. **步序即默认边**：`steps` 的书写顺序定义 happy path——每步 `succeeded` 默认走向下一步；不想进默认链的步（如 `fix`）放在末尾、只经显式转换进入。
2. **显式转换**：`transitions` 的 `on` 取 worker 结果（`succeeded` / `failed` / `findings-blocking`）；显式边优先于默认边。
3. **`readonly: true`**：该步 Worker 的任何工作树写入都会让步骤按失败处理并落账——Reviewer 不改代码是不变量 9，靠 Runner 的前后快照比对强制，不靠 prompt 自觉。
4. **`optional` / `requiredWhen`**：可选步默认跳过；`requiredWhen: ui-delivery` 在 UI 交付时强制（配合 [ui-render-gate](03-policy-guide.md) 与不变量 22）。
5. **`terminal`**：列出的步是出口。加载器做**无出口环检测**——verify⇄fix 这类环必须存在能到 terminal 的路径，否则拒绝加载。
6. **无 worker 的步**（如 `wait-merge`）是纯等待/决定点，Runner 在这里产生 `HUMAN_REQUESTED` 或按 `stopAt` 停下。

## 与 run 配置的关系

run 配置里 `entry` 可覆盖 workflow 的 `entry`（例如从 `build` 起步、跳过 intent/plan 步——digest 仍会绑进批准对象）；`stopAt` 指定停点。workflow 文件整体做 sha256 → `RUN_CREATED.workflowDigest`，事后可证明当时跑的是哪份流程。

## 修改纪律

预设是产品的一部分：改 `software-delivery.yaml` 前先想清是不是项目差异——项目差异用自己的 workflow 文件（run 配置 `workflow:` 指过去），不改官方预设。schema additive-only，破坏性改法升 `version`。
