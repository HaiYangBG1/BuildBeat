# REVIEW.md — 简账 Review 规范

> **Optional**: 本文件由项目拥有；缺失时 BuildBeat 直接跳过，不作为告警或错误。
> **AI write boundary**: 默认只读；只在项目 Review 口径被明确改变时修改。
> **Status**: Confirmed

## Rules

- `REVIEW-MUST-001`: 逐项核对一期范围、非目标、错误态与金额口径，不以测试绿替代需求覆盖。
- `REVIEW-MUST-002`: 核对跨仓契约、SQLite migration 与向后兼容边界。
- `REVIEW-MUST-003`: 核对单元、API 集成、主流程 E2E、真渲染和 evidence 路径。
- `REVIEW-MUST-004`: 核对输入校验、日志脱敏、账目持久化和回滚风险。
- `REVIEW-SHOULD-001`: 拒绝无需求支撑的抽象、依赖或复杂状态层。
- `REVIEW-SHOULD-002`: 确认看板、status、decisions 与同一候选一致。

review-ready 与 reviewer 调用节奏仍以 `AGENTS.md` 为准。
