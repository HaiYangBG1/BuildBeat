# v2 迭代 06：M4 evals、度量与试点

> 状态：**工程面 + Self-host + 外部试点完成；六退出指标全部达标（自动到达率 2/2）。仅余 D6 口径确认（1 项目双验收面是否即满足"外部试点 ≥2"）待所有者定夺后关闭 M4**（2026-08-28）
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8 M4；M3 收尾：[`V2-ITERATION-05.md`](V2-ITERATION-05.md)
> 时间盒：**≤3 周**；授权边界沿用 `V2-D2=A`（仅本地 `v2` 分支；self-host 试点 Run 停在 `WAITING_HUMAN`，不 merge、不 push）

## 任务清单

- [x] **T1 确定性套件补洞（WP5.1）**：Scope 越界即停（`allowedPaths`，越界不 pin candidate、`workspace.scope` BLOCK 落账）；仓库级单活动 Run 锁；Adapter 故障路径 timeout/crash/spawn-error 端到端（`tests/v2-invariants.test.js`）。
- [x] **T2 行为 evals 九目录（WP5.2）**：[`evals/`](../evals/README.md) 九场景卡 + 机器检查全部进 `tests/v2-evals.test.js`（`npm test` 单入口）；每次真实事故收敛后在此追加永久回归。
- [x] **T3 `metrics` v0**：本地只读，从 ledger 派生——终态分布、自动到达 `WAITING_HUMAN` 率、fix 轮次分布、人批等待、证据完整率、stale/预算计数；`--json` 可选（`tests/v2-metrics.test.js`）。
- [x] **T4 Self-host 试点**：`RUN-SELF-001` 在本仓库真实跑通 build→verify（真实测试）→只读 review→停在合并决定，28 事件链校验通过；真实 remote 上实测推送保护生效；**试点抓到并修复一个真实缺陷**（YAML 子集引号标量误判）。证据：[`v2/M4-SELFHOST-2026-08-28.md`](v2/M4-SELFHOST-2026-08-28.md)；Run 留在 inbox 待项目所有者处置。
- [x] **T5 外部试点**：所有者点名真实需求 `LXJ-AUTH-CLI-DW-01`（ruoyi-ai 单仓，"文档 web 页面理解为 UI"）——`RUN-CLI-DW-01` 由 **codex CLI 经 Shell Adapter** 全自动 5.2 分钟到合并决定：15 文件候选全在范围内、JDK17 全量 + portal 测试一次全绿、只读 review 零 findings、portal 页真渲染截图证据在册；停在 inbox 待所有者。证据：[`v2/M4-EXTERNAL-PILOT-2026-08-28.md`](v2/M4-EXTERNAL-PILOT-2026-08-28.md)。**D6 口径（1 项目双验收面 vs ≥2 项目）待所有者定夺后 M4 正式关闭。**
- [x] **T6 M4 退出指标核验**：六指标表见 [`v2/M4-SELFHOST-2026-08-28.md`](v2/M4-SELFHOST-2026-08-28.md) §4——五项达标；"试点 Run 自动到达率"分母仅 self-host（1/1），外部试点部分如实标 `UNVERIFIED` 待 T5 回填。

## 完成定义

T1–T4 全绿 + T6 核验表（外部试点相关行允许 `UNVERIFIED` 并注明等待 T5）；T5 完成后回填指标，`V2-PLAN.md` §8 M4 标记完成后进入 M5。
