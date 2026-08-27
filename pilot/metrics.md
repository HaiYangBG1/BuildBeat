# M-1 试点度量记录

> 真实任务表与故障矩阵共同构成 `V2-D2` 的证据。只填其中一张不能做分叉决定；数据随运行填写，不事后补写。

## 真实任务

| # | 日期 | 工作项 | 性质 | attempts | 基线验收失败 | 最终回归/验收 | 计划外介入 | token/费用（约） | 卡点摘要 |
|---|---|---|---:|---:|---|---|---:|---:|---|
| 1 | 2026-08-27 | ChickAI：额度耗尽仍可登录网站，模型发送禁用且不补发 Key | 含 UI | | 待跑 | 待跑 | | | |
| 2 | 2026-08-27 | Tide：悬浮球空闲缩入左侧并半透明隐藏 | 小功能 | | 待跑 | 待跑 | | | |
| 3 | | 待项目所有者后续决定是否补充 | 待定 | | | | | | |

## 能力覆盖矩阵

结果只允许 `COVERED / PARTIAL / MISSING / N/A`。等级权重：`CRITICAL=2`、`NORMAL=1`；得分：`COVERED=1`、`PARTIAL=0.5`、`MISSING=0`，`N/A` 不进分母。

| 能力 | 等级 | 适合组装？ | 结果 | 证据/场景 | 计划外介入 | 去向：assemble / thin-core / full-core / defer |
|---|---:|---|---|---|---:|---|
| Agent 调用与异常退出留痕 | CRITICAL | 是 | | | | |
| 基线假绿阻断 + 双验证 | CRITICAL | 是 | | | | |
| Verify→Fix 收敛与预算上限 | CRITICAL | 是 | | | | |
| fresh-context Reviewer 只读 | CRITICAL | 是 | | | | |
| 进程中断后的状态恢复 | CRITICAL | 是 | | | | |
| candidate/plan 变化后 Approval stale | CRITICAL | 否，默认 thin-core | | | | |
| 证据来源、digest 与未验证范围 | CRITICAL | 否，默认 thin-core | | | | |
| Policy/Scope/受保护路径强制 | CRITICAL | 部分，默认 thin-core | | | | |
| 无 merge/push/deploy/生产能力 | CRITICAL | 部分 | | | | |
| UI 真渲染入口 + 截图 digest | NORMAL | 是 | | | | |
| token/time/cost 可读预算 | NORMAL | 是 | | | | |

**组装覆盖率**只计算“适合组装？= 是”的非 `N/A` 行：

```text
Σ(等级权重 × 结果得分) / Σ(等级权重) × 100%
```

“部分”行单独做架构判断，不能为了凑 80% 强行归入分母。

## 故障注入

| 场景 | 预期 | 结果 | 证据 |
|---|---|---|---|
| F1 Agent 非零退出 | Run 阻断，旧测试绿色不得掩盖 | | |
| F2 `ACCEPT_CMD` 基线已绿 | 开跑前阻断 | | |
| F3 Builder/Fixer 修改 protected path | 立即阻断并指出路径 | | |
| F4 Reviewer 修改任意工作区内容 | 指纹变化，立即阻断 | | |
| F5 Verify 中途杀进程后重开 | 明确恢复点；若靠人记忆则记结构性缺口 | | |
| F6 Approval 后 candidate/plan 改变 | 旧 Approval 必须失效；pilot 做不到则记 thin-core 需求 | | |

## 卡点登记

### 卡点 1

- 现象：
- 根因：脚本简陋 / 厂商限制 / 结构性缺口
- 当时怎么绕过：
- 若有内核，它应该做什么：
- 对应能力矩阵行：

### 卡点 2

- 现象：
- 根因：脚本简陋 / 厂商限制 / 结构性缺口
- 当时怎么绕过：
- 若有内核，它应该做什么：
- 对应能力矩阵行：

## `V2-D2` 分叉决定

- 三轮平均计划外介入：
- 组装覆盖率：
- 重复出现的 CRITICAL 结构性缺口：
- 结论：**(a) 完整内核 / (b) 薄内核**
- 依据：
- 各缺口去向：
- 决定日期与拍板人：
