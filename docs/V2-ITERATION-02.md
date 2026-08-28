# v2 迭代 02：M0 核心重置

> 状态：**RFC 草案就绪，待 M0 退出评审（人工门）**
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8 M0；`V2-D2=A`（[`V2-DECISIONS.md`](V2-DECISIONS.md)）
> 时间盒：**≤1 周**（自 2026-08-28 起算）

## 迭代目标（唯一交付）

M0 退出：核心名词、MVP 范围、旧概念处置（保留/转换/删除）无歧义；三份 RFC + 事件格式 v1 定稿。定稿即进入 M1（最小纵切）。

## 任务清单

- [x] **T1 产品定位 RFC**：[`v2/RFC-0001-product-definition.md`](v2/RFC-0001-product-definition.md)——定位/边界/用户、Runner 与手工模式地位、v1 处置，以及**自研面逐项标注"厂商结构性不做"理由 + M-1 证据**（收尾修正二）。
- [x] **T2 领域模型 RFC**：[`v2/RFC-0002-domain-model.md`](v2/RFC-0002-domain-model.md)——十三实体、状态模型、Evidence/Approval 合同、双平面存储与压实合同、核心名词消歧表、v1 概念处置表。
- [x] **T3 Workflow/Policy RFC**：[`v2/RFC-0003-workflow-policy.md`](v2/RFC-0003-workflow-policy.md)——Workflow 文件模型、GateResult、Policy 四类 + 算子 + 强制等级、Approval/stale 流程、Loop 终止默认值、Risk Preset，**含 observe/bands schema 冻结**（裁决 #6）。
- [x] **T4 事件格式 v1**：[`v2/SPEC-0001-events-v1.md`](v2/SPEC-0001-events-v1.md)——信封、损坏处理、reducer 合同、初始事件类型注册表；定稿即 FROZEN，此后 additive-only（裁决 #8）。
- [x] **T5 v1 冻结与分支**：`v1-maintenance` / `v2` 分支已于 `V2-D0` 时建立，npm `latest` 留 v1；无新增动作。
- [ ] **T6 M0 退出评审（人工门）**：项目所有者审阅上述四份文档；定稿（含修改后定稿）即 M0 退出，`V2-D2=A` 台账行的"M0 退出评审"随之关闭，进入 M1。

## 需求来源纪律

三份 RFC 的每个非纯工程条目均引用 M-1 试点记录（[`pilot/metrics.md`](../pilot/metrics.md) 卡点 1–5、能力矩阵、F1–F6，[`pilot/evidence/2026-08-28-m1-runtime-gap.md`](../pilot/evidence/2026-08-28-m1-runtime-gap.md)），不引入无试点来源的新需求。

## 边界

- M0 只产出文档与 schema 冻结，**不开始真实 Adapter 或内核编码**（报告 B M0 退出标准）；
- 授权边界沿用 `V2-D2=A`：仅本地 `v2` 分支，不含 push、merge、发布、部署、生产动作；
- RFC 与 [`V2-PLAN.md`](V2-PLAN.md) 冲突时以 V2-PLAN 为准，除非项目所有者在评审中明确改判（改判须回写台账）。

## 完成定义

四份文档由项目所有者定稿；歧义清单清零；[`V2-PLAN.md`](V2-PLAN.md) §8 M0 标记完成后进入迭代 03（M1 最小纵切：events store + reducer + workflow parser + Workspace Manager + Mock/Shell Adapter + Evidence Collector v0 + `run start/status/stop`）。
