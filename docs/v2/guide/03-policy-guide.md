# Policy 指南

权威：[`RFC-0003 §4`](../RFC-0003-workflow-policy.md)；实现：`src/v2/policy/policy.js`。范本：risk 预设内嵌策略（`src/v2/presets/risk/*.yaml`）与 [`ui-render-gate.yaml`](../../../src/v2/presets/policies/ui-render-gate.yaml)。

## 一条 Policy 的形状

```yaml
kind: policy
version: 1
name: merge-evidence-floor
type: transition            # pre | post | transition | action
appliesTo: enter-wait-merge # pre/post 填步 id；transition 填 enter-<步>
enforcement: LOCAL_ENFORCED # ADVISORY | LOCAL_ENFORCED | SERVER_ENFORCED
rule:
  all:
    - evidence.exists:
        kind: command
        minGrade: L2
    - finding.maxSeverity:
        atMost: P2
```

## 8 个算子与三值逻辑

| 算子 | 含义 |
|---|---|
| `all` / `any` / `not` | 组合子 |
| `evidence.exists: {kind, minGrade}` | 存在指定种类、等级达标的证据 |
| `artifact.accepted: {artifact}` | 工件（plan/intent/spec）已被 digest 绑定地接受 |
| `attempts.lt: {step, max}` | 某步尝试次数未超上限 |
| `budget.remaining: {kind}` | 预算仍有余量 |
| `candidate.clean` | 存在已固定且干净的 candidate |
| `human.approved: {transition}` | 存在未 stale 的对应批准 |
| `finding.maxSeverity: {atMost}` | 未解决 findings 严重度不超过阈值 |

求值是**三值**的：`PASS` / `FAIL` / `UNVERIFIED`。取不到数据（证据缺失、无 candidate）永远是 `UNVERIFIED` 而不是通过——`UNVERIFIED` 在任何门上都不会被当作 `PASS`（GateResult 六值见 RFC-0003 §3.3）。

**候选作用域**：待批对象带 candidate 时，`evidence.exists` 与 `finding.maxSeverity` 只统计该 candidate 的证据——被新一轮修复取代的旧 review findings 不会挡住已修好的候选（2026-08-28 真实事故的永久回归在 `tests/` 与 `evals/`）。

## 四类挂点

- `pre`：步开始前（如 `plan-accepted` 挡在 build 前）；
- `post`：步结束后；
- `transition`：状态转换瞬间（如 merge 决定盖章那一刻 re-check——批准命令会在盖章前重读实况，门不过则拒绝落章）;
- `action`：保护动作前（配合 [安全边界](09-security-boundaries.md)）。

## 强制等级

`ADVISORY` 只提示 Worker；`LOCAL_ENFORCED` 由 Runner/Workspace 物理执行（本地能保证的都用它）；`SERVER_ENFORCED` 声明该门在服务端（分支保护/CI/部署平台）——Runner 落账但不能替服务端保证。诚实标注：本地挡不住的不要标 LOCAL。

## 接入

run 配置 `policies:` 列表引用文件路径；risk 预设（`fast`/`standard`/`controlled`/`legacy-four-gates`）自带一组策略与停点，`riskPreset:` 一行即可启用，再叠加项目自定义策略。
