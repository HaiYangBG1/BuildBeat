# Human Approval 指南

权威：[`RFC-0003 §5`](../RFC-0003-workflow-policy.md)；实现：`src/v2/runtime/decisions.js`。原则：**人批的是一个 digest 绑定的对象，不是一句"可以了"**。

## 批准绑定什么

一次批准 = `transition + candidate + planDigest + evidenceDigest` 四元组。其中任何一项事后变化，批准自动 `APPROVAL_STALE`，Run 回到 `WAITING_HUMAN`——旧章不能盖新对象（stale 复用 0 是退出指标，试点实测 0）。

## 日常操作

```bash
buildbeat-v2 inbox --repo .                 # 所有等人的 Run：transition、candidate、digest、理由
buildbeat-v2 status --repo . --run RUN-X    # 单个 Run 的完整派生视图（步、证据、findings）
buildbeat-v2 approve --repo . --run RUN-X --transition enter-wait-merge --by <名字> --config <run-config>
buildbeat-v2 reject  --repo . --run RUN-X --reason "<为什么>" --by <名字>
buildbeat-v2 accept  --repo . --work WORK-X --artifact plan --by <名字>   # 工件接受（digest 绑定）
```

决定落 Git 面 `delivery/work/<id>/decisions.jsonl`，事件台账同步记 `DECISION_RECORDED`。

## approve 的安全语义（都有测试）

1. **transition 必须匹配**当前待批项；
2. **盖章前重读实况**：待批快照与实况不一致（候选又动了、计划改了）→ 拒绝并要求刷新，不落章；
3. **transition 门在盖章瞬间 re-check**：merge-evidence-floor / ui-render-gate 等此刻不 PASS → 拒绝；
4. 终局决定（final-decision 类待批）批准即 `RUN_TERMINAL SUCCEEDED` + 压实 run-record 进 Git 面。

## 批准 ≠ 执行

merge 批准只表示 **merge-ready**：真正的合并、push、发布是你在 Runner 之外的动作（保护动作见 [安全边界](09-security-boundaries.md)）。同理 observe 草稿的 `fix_now` 只是接受，Run 由人发起。

## 人批点由 Risk Preset 决定

`fast` 仅 Merge；`standard` Plan+Merge；`controlled` Intent+Plan+Merge+Release；`legacy-four-gates` 为 v1 四 Gate 完整形态（迁移期用，见 [迁移指南](08-migration-v1.md)）。待批项强制携带 findings 摘要与理由——防"秒批"退化；人批等待时长进 `metrics`。
