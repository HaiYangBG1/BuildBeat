# BuildBeat v2 使用文档

> 规范权威在 RFC/SPEC（[`RFC-0001`](../RFC-0001-product-definition.md) 产品定位 / [`RFC-0002`](../RFC-0002-domain-model.md) 域模型 / [`RFC-0003`](../RFC-0003-workflow-policy.md) workflow 与 policy / [`SPEC-0001`](../SPEC-0001-events-v1.md) 事件 schema）；本目录是操作视角，与实现冲突时以 RFC/SPEC 与代码为准并回报。设计历史（V2-PLAN、迭代记录）不在本目录。

## 第一次使用

| 文档 | 一句话 |
|---|---|
| [怎么和会话说话](00-how-to-talk.md) | **给用户看的**：项目从未开始到换期，每个阶段你说什么、会话做什么、你得到什么 |
| [快速开始](01-quickstart.md) | 第一个 Run：装 `@latest` → 工作项与 run 配置 → accept → doctor → start → 看证据拍板；含失败分支 |
| [`templates/v2/`](../../../templates/v2/AGENTS.md) | 项目装载入口（AGENTS / CLAUDE / 指挥台 / BUILDBEAT 标记）、run 配置样板、信封 prompt 与 worker 包装 |

在 AI 会话里用的人只需读第 0 篇；会话读 `SKILL.md` §0.5 驾驶手册。

## 日常使用

| 文档 | 一句话 |
|---|---|
| [Human Approval 指南](07-approval-guide.md) | inbox / approve / stale；接受、批准某转换、合并决定五词各指什么；分诊门；等待要能找到人；overview |
| [Evidence 指南](06-evidence-guide.md) | 回读制证据、状态/等级、UNVERIFIED 文化、observe |
| [故障恢复手册](10-recovery.md) | 台账损坏、Run 中断、infra 停人、锁、runtime 全删重建、gc |

## 配置参考

| 文档 | 一句话 |
|---|---|
| [Workflow 编写指南](02-workflow-guide.md) | 步序、显式转换、readonly、terminal、预算、cache、requires |
| [Policy 指南](03-policy-guide.md) | 四类 Policy、8 算子、三值逻辑、强制等级 |
| [Adapter 指南](04-adapter-guide.md) | Shell/Mock、env 白名单与 `env:` 注入、接任意 CLI Agent、实时输出 |
| [Worker 合同](05-worker-contract.md) | 输入输出信封（`severity` + `summary`）、阻断语义、各角色纪律、包装脚本 |
| [安全与权限边界](09-security-boundaries.md) | 内核实际做到的 vs 不能由此推出的；无人值守三层前置条件 |

## 迁移

| 文档 | 一句话 |
|---|---|
| [v1 迁移指南](08-migration-v1.md) | 升级 CLI 与迁移项目状态分开；手工 runbook，单向迁移不双写 |

observe v0（探测→分层响应→Intent 草稿→人分诊）在 [快速开始 §9](01-quickstart.md) 与 [Evidence 指南](06-evidence-guide.md) 中覆盖；schema 冻结见 [`RFC-0003 §8`](../RFC-0003-workflow-policy.md)。
