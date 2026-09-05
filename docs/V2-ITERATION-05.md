# v2 迭代 05：M3 治理硬化

> 状态：**已完成**（2026-08-28；M2 DoD #1 复核为 ✓，#20 收窄为仅剩 coverage 字段纪律挂 M4）
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8 M3；M2 核验：[`v2/M2-DOD-2026-08-28.md`](v2/M2-DOD-2026-08-28.md)（#1/#20 PARTIAL 在本迭代关闭）
> 时间盒：**≤2 周**；授权边界沿用 `V2-D2=A`（仅本地 `v2` 分支，不含 push/merge/发布/部署/生产）

## 任务清单

- [x] **T1 Policy Engine**：`src/v2/policy/policy.js`——解析 fail-closed（未知算子/字段/类型拒绝）；算子 `all/any/not`、`evidence.exists{kind,minGrade}`、`artifact.accepted`、`attempts.lt`、`budget.remaining`、`candidate.clean`、`human.approved`、`finding.maxSeverity`；三值逻辑，`UNVERIFIED` 永不当 PASS（`tests/v2-policy.test.js`）。
- [x] **T2 四类接线**：pre/post 进 orchestrator（fail → WAIT_HUMAN，`onFail: BLOCK` → 终态；`ADVISORY` 只记录）；transition 在 approve 时强制——`LOCAL_ENFORCED` 不满足即拒绝盖章并留 POLICY_EVALUATED 审计，`ADVISORY` 仅随结果警告；action 由 T3 能力剥离承担（`tests/v2-governance.test.js`）。
- [x] **T3 Protected Actions 真实强制**：① Shell Adapter 默认**环境变量白名单**（宿主凭据 env 不达 Worker，`inheritEnv: true` 显式 opt-in 且 doctor 警告）；② workspace 创建时对全部 remote 设 worktree 级 `pushurl=protected://…`（worktree 内 push 直接失败，主检出不受影响）；merge/deploy/publish 内核无调用路径（不变量 20）。
- [x] **T4 artifact.accepted + accept 命令**：接受即绑定文件 digest 的决策落 `decisions.jsonl`；工件再改动接受即 stale，重新接受重新绑定（关闭 DoD #1；`v2-policy` + `v2-governance` 第 1 例）。
- [x] **T5 Risk Preset ×4**：`src/v2/presets/risk/{fast,standard,controlled,legacy-four-gates}.yaml` + 加载器；四预设全部保留人工合并门 + 证据地板；legacy 映射 G1→intent 接受、G2→plan 接受 + build 前人批、G3→合并决定、G4→超出 MVP（`tests/v2-risk-presets.test.js`）。
- [x] **T6 UI 真渲染 Gate**：`src/v2/presets/policies/ui-render-gate.yaml`（approval 前必须存在带 digest 的 screenshot 证据）；approve 侧强制验证（`v2-governance` 第 2 例，不变量 22）。
- [x] **T7 doctor 强制等级报告**：逐条 Policy 报告声明 vs 实际等级；`SERVER_ENFORCED` 一律报"本地不可验证，不宣称"；Worker env 模式与推送保护状态一并报告（CLI e2e 断言）。
- [x] **T8 events / replay 补全**：`events`（台账列印 + 损坏警告）与 `replay`（digest/prev/seq 链校验 + 派生状态摘要）（CLI e2e 断言）。

## 完成定义

上述能力各有测试；M2 DoD #1/#20 复核为 ✓；`V2-PLAN.md` §8 M3 标记完成后进入 M4（evals、度量与试点）。**2026-08-28 达成**：T1–T8 全绿（v2 套件 58 项）；DoD #1 已 ✓（digest 绑定接受 + staleness）；#20 的 M3 部分（grade 地板 + `UNVERIFIED` 门控）已 ✓，coverage 字段纪律按原计划随 M4 evals 落地。进入 M4。
