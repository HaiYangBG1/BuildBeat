# REVIEW.md — <项目名> Review 规范

> **Optional**: 本文件由项目拥有；缺失时 BuildBeat 直接跳过，不作为告警或错误。
> **AI write boundary**: 默认只读；只在项目 Review 口径被明确改变时修改，不用它记录成员、岗位、响应 SLA 或审批人。
> **Status**: Draft

## 最小检查维度

- `REVIEW-MUST-001`: 核对规格、非目标、验收条件与实现行为，不以“测试绿”替代需求覆盖。
- `REVIEW-MUST-002`: 核对契约、架构、数据与兼容性变化是否同步，并明确不可外推的未验证范围。
- `REVIEW-MUST-003`: 核对受影响自动化测试、真渲染走查和 evidence；完成声明必须可追溯到候选与证据。
- `REVIEW-MUST-004`: 核对 Secret、鉴权、租户、输入、持久化、依赖与不可逆副作用风险。
- `REVIEW-SHOULD-001`: 识别不必要复杂度、重复抽象、不可维护分支和缺少回滚路径的设计。
- `REVIEW-SHOULD-002`: 核对看板、status、decisions 与交付候选一致，不把旧报告复用于变化后的候选。

## 项目增量

<项目特有 Review 条件>

review-ready、milestone、risk-delta 与 closure 的触发节奏仍以 `AGENTS.md` 为准，本文件不新建第二套流程。
