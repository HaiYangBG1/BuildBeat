# M4 外部试点证据：lxj-auth 数仓 CLI 标识重命名（RUN-CLI-DW-01）

> 日期：2026-08-28
> 项目：`AI底座/底座/ruoyi-ai`（真实业务单仓：Java 多模块 + Node portal 测试 + 真实 codeup remote）
> 任务：项目所有者点名的真实需求 `LXJ-AUTH-CLI-DW-01`——数仓 CLI 公有客户端标识 `cli-dwh` 精确重命名为 `cli-dw`（meta 仓 `pm/decisions.md` 当日拍板行）
> 结论上限：本地候选 + 本地真实测试；不含生产切换（提案 §4 硬门未授权）。**Run 停在合并决定，等待项目所有者。**

## 1. 为什么这个试点有分量

同一需求今天早些时候已被**人工方式**做过一遍：候选散落在两个仓的未提交工作树里，与无关改动混杂，当日人工 L3 证据自记"没有 clean candidate hash，不满足 review-ready"。本 Run 从**已提交干净基线** `a99d2ad1`（仍是 `cli-dwh`）出发，由 v2 Runner 驱动真实 Agent 独立重做，产出可审查的干净 candidate——这正是 M-1 卡点（人是节拍器、无干净候选）的正面对照。人工候选未被触碰，不倒算、不回放。

## 2. 流程事实（5.2 分钟全自动到合并决定）

| 事实 | 值 |
|---|---|
| Workers | **codex CLI 经 Shell Adapter**（厂商中立实证：Claude CLI 未登录不可用，换 codex 零运行时改动，裁决 #5） |
| builder | `codex exec -s workspace-write`（沙箱内只改文件；commit 由包装脚本机械执行）；15 文件 +68/−33，**全部在 `lxj-auth/` 内**（allowedPaths 强制） |
| verify | `test-jdk17.sh`（Surefire 全量）+ portal node 测试 + 验收 grep（`cli-dwh` 零残留、`cli-dw` 在册）——一次全绿，退出码回读 |
| review | `codex exec -s read-only` fresh-context 只读审查，结构化信封 `{"status":"succeeded","findings":[]}` |
| candidate | `f97f122`（Git 回读固定，位于 `run/RUN-CLI-DW-01` 分支，未合并） |
| UI 证据 | portal 文档页 Chrome headless 真渲染截图（页面源码含 `cli-dw`、无 `cli-dwh`），digest 登记为 screenshot 证据（seq 29）；`ui-render-merge-gate` 要求批准前必须存在 |
| 治理 | `standard` 预设：plan/intent digest 绑定接受（`A-WORK-CLI-DW-01-1/2`，by haiyangbg）为 build 前置门；env 白名单（宿主凭据不达 codex 子进程）；真实 codeup remote 上 worktree 推送保护生效 |
| 台账 | 29 事件链校验通过；metrics：自动到达 `WAITING_HUMAN` 100%、证据完整率 100%（3/3 步） |
| 成本 | codex token/费用本轮无采集口径，记 `UNVERIFIED` |

## 3. 明确的边界

- **跨仓未绑定**：契约文件（meta 仓 `contracts/PROTOCOL.md`）不在本单仓 Run 内——MVP 单仓限制（卡点 2/4 的已知项），契约同步由既有人工候选/后续流程处置；
- fixer 未配置真实 Agent（verify 若失败将停为 attended handoff）——本轮未触发；
- 不 merge、不 push、不部署、不改生产 `sys_client`；生产切换硬门（提案 §4）未授权、未执行。

## 4. 合并决定（已批准）

项目所有者于 2026-08-28 批准：`D-RUN-CLI-DW-01-1`（merge-evidence-floor 与 ui-render-merge-gate 在盖章瞬间均为 PASS）。Run 终态 `SUCCEEDED`，压实为 `delivery/work/WORK-CLI-DW-01/runs/RUN-CLI-DW-01/run-record.json`，最终台账 34 事件链校验通过；worktree 已清理，candidate `f97f122` 保留在 `run/RUN-CLI-DW-01` 分支可达。

批准仅表示 merge-ready；将候选并入工作分支、与既有人工候选合流、契约同步与生产切换（提案 §4 硬门）均为后续人工决定，本 Run 未执行任何一项。

## 4.1 生产切换（2026-08-28 当日晚，所有者逐步授权后完成）

candidate `f97f122` 经 cherry-pick 到生产血统（`codeup/master`，规避了本地分支上未批准的 registry 在途工作与已部署内网文档的双向分叉）→ 全量验证（Surefire 全套 + Portal 29/29 + 零残留）→ 按提案 §4 硬门完成生产切换：只读盘点（唯一 `cli-dwh` 行 / 零 Nacos 覆盖 / 零真实消费方登录记录）→ **有界双行窗口**破解新旧健康门顺序死锁（先 INSERT `cli-dw` 镜像行 → 云效 Run #31 双批发布 SUCCESS → 软删旧行收口）→ L4 全绿（`cli-dw` 200 ×2、`cli-dwh` 400 ×2、`/index` 200 全程无扰动）。证据：meta 仓 `pm/archive/登录二期/evidence/2026-08-28-LXJ-AUTH-CLI-DW-01-生产切换.md`。

## 5. 对 M4 退出指标的回填

- 试点 Run 自动到达 `WAITING_HUMAN`：**2/2（self-host + 外部各一）= 100% ≥ 70%** ✓；
- 其余五项维持 [`M4-SELFHOST-2026-08-28.md`](M4-SELFHOST-2026-08-28.md) §4 的达标结论，本 Run 数据同向（完整率 100%、stale 0、超预算 0、Reviewer 写入 0、可追溯 100%）。
- **口径提示**：D6 原文为外部试点 ≥2 个项目（有测试单仓 + 含 UI 各一）；本轮为 **1 个项目同时覆盖两个验收面**（所有者明示"文档 web 页面可以理解为 UI"）。以此满足 D6、或再补一个独立项目，由项目所有者定夺——定夺后 M4 正式关闭。
