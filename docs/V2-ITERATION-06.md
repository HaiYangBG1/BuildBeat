# v2 迭代 06：M4 evals、度量与试点

> 状态：**进行中**（自 2026-08-28 起）
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8 M4；M3 收尾：[`V2-ITERATION-05.md`](V2-ITERATION-05.md)
> 时间盒：**≤3 周**；授权边界沿用 `V2-D2=A`（仅本地 `v2` 分支；self-host 试点 Run 停在 `WAITING_HUMAN`，不 merge、不 push）

## 任务清单

- [ ] **T1 确定性套件补洞（WP5.1）**：Scope 越界即停（`allowedPaths`，Worker 改到范围外不 pin candidate、升级给人）；仓库级单活动 Run 锁；Adapter 故障路径（timeout / crash / spawn error）端到端；不变量显式回归。
- [ ] **T2 行为 evals 九目录（WP5.2）**：`evals/` 九场景卡（plan-scope、gate-cannot-self-pass、failing-test-first、fix-loop、reviewer-readonly、stale-approval、protected-action、no-progress、evidence-required）+ 机器检查全部进 `tests/v2-evals.test.js`（`npm test` 单入口）；每次真实事故收敛后在此追加永久回归。
- [ ] **T3 `metrics` v0**：本地只读，从 run ledger 派生——run 总数与终态分布、自动到达 `WAITING_HUMAN` 率、fix 轮次分布、人批等待时长、证据完整率、stale/预算停止计数；`--json` 可选。无采集无上传。
- [ ] **T4 Self-host 试点（BuildBeat builds BuildBeat）**：在本仓库真实跑一个 Work（intent/plan 接受 → build → verify（真实测试）→ 只读 review → 停在合并决定），Run 留在 inbox 待项目所有者决定；证据入 `docs/v2/`。
- [ ] **T5 外部试点 ≥2（待项目所有者点名）**：按 D6 为底座内一个有测试的单仓项目 + 一个含 UI 项目；需要点名项目与授权边界后执行。
- [ ] **T6 M4 退出指标核验**：状态转换可追溯 100%、stale Approval 复用 0、超预算继续运行 0、试点 Run 自动到达 `WAITING_HUMAN` ≥70%、证据完整率 ≥95%、Reviewer 改代码 0——逐条给证据；外部试点未跑的部分如实标 `UNVERIFIED`。

## 完成定义

T1–T4 全绿 + T6 核验表（外部试点相关行允许 `UNVERIFIED` 并注明等待 T5）；T5 完成后回填指标，`V2-PLAN.md` §8 M4 标记完成后进入 M5。
