# BuildBeat v2 使用文档（十件套）

> 对应 [`V2-PLAN.md`](../../V2-PLAN.md) §8 M5 / 报告 B WP6.3。规范权威在 RFC/SPEC（[`RFC-0001`](../RFC-0001-product-definition.md) / [`RFC-0002`](../RFC-0002-domain-model.md) / [`RFC-0003`](../RFC-0003-workflow-policy.md) / [`SPEC-0001`](../SPEC-0001-events-v1.md)）；本目录是操作视角，与实现冲突时以 RFC/SPEC 与代码为准并回报。

| # | 文档 | 一句话 |
|---|---|---|
| 0 | [怎么和会话说话](00-how-to-talk.md) | **给用户看的**：项目从未开始到换期，每个阶段你说什么、会话做什么、你得到什么 |
| 1 | [快速开始](01-quickstart.md) | 5 分钟：装 beta → 写 run 配置 → 跑到合并决定 |
| 2 | [Workflow 编写指南](02-workflow-guide.md) | 步序、显式转换、readonly、terminal |
| 3 | [Policy 指南](03-policy-guide.md) | 四类 Policy、8 算子、三值逻辑、强制等级 |
| 4 | [Adapter 指南](04-adapter-guide.md) | Shell/Mock、env 白名单、接任意 CLI Agent |
| 5 | [Worker 合同](05-worker-contract.md) | 输入输出信封、各角色纪律 |
| 6 | [Evidence 指南](06-evidence-guide.md) | 回读制证据、状态/等级、UNVERIFIED 文化 |
| 7 | [Human Approval 指南](07-approval-guide.md) | inbox / approve / stale、批准绑定什么 |
| 8 | [v1 迁移指南](08-migration-v1.md) | 半天手工 runbook，单向迁移不双写 |
| 9 | [安全与权限边界](09-security-boundaries.md) | 保护动作=能力移除；无人值守前置条件 |
| 10 | [故障恢复手册](10-recovery.md) | 台账损坏、Run 中断、锁、runtime 全删重建 |

observe v0（探测→分层响应→Intent 草稿→人分诊）在 [快速开始 §5](01-quickstart.md) 与 [Evidence 指南](06-evidence-guide.md) 中覆盖；schema 冻结见 [`RFC-0003 §8`](../RFC-0003-workflow-policy.md)。

迭代 08 起：`SKILL.md` §0.5 是给 AI 会话读的 v2 驾驶手册（用户一句话 → 会话调什么），v2 项目的装载入口模板在 [`templates/v2/`](../../../templates/v2/AGENTS.md)。
