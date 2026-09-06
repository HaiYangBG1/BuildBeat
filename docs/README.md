# docs/ 总入口

> 这一页只回答"我该读哪份"。文件按**现行**与**历史**分开：现行文档描述今天的包（`@haiyangbg/buildbeat@latest`，v2 系列）并受 `tests/check_docs.py` 的时效检查约束；历史文档保存当时的事实与数字，只加状态说明、不改原文。

## 现行：用户读

| 你要做什么 | 读 |
|---|---|
| 第一次用 v2，在 AI 会话里 | [`v2/guide/00-how-to-talk.md`](v2/guide/00-how-to-talk.md) → 会话读 [`SKILL.md`](../SKILL.md) §0.5 |
| 第一次用 v2，自己敲命令核对 | [`v2/guide/01-quickstart.md`](v2/guide/01-quickstart.md) |
| 十件套指南（日常 / 配置 / 迁移） | [`v2/guide/README.md`](v2/guide/README.md) |
| 四个可用面各能做什么（Skill-only / v1 CLI / v2 运行时 / 插件） | [`CAPABILITY-MATRIX.md`](CAPABILITY-MATRIX.md) |
| v1 生命周期 CLI（`buildbeat doctor/init/adopt/upgrade`） | [`CLI.md`](CLI.md)、[`CHECKS.md`](CHECKS.md) |
| 从 v1 文件总线迁到 v2 | [`v2/guide/08-migration-v1.md`](v2/guide/08-migration-v1.md) |
| v1.16 拷出项目重建 schema 2 基线 | [`LEGACY-V1.16-MIGRATION.md`](LEGACY-V1.16-MIGRATION.md) |
| 项目装载入口与信封模板 | [`../templates/v2/`](../templates/v2/AGENTS.md) |

## 现行：规范与维护

| 内容 | 读 |
|---|---|
| v2 产品定位 / 域模型 / workflow 与 policy / 事件 schema | [`v2/RFC-0001`](v2/RFC-0001-product-definition.md) / [`RFC-0002`](v2/RFC-0002-domain-model.md) / [`RFC-0003`](v2/RFC-0003-workflow-policy.md) / [`SPEC-0001`](v2/SPEC-0001-events-v1.md)（`FINAL`；带日期的生效修订写在正文顶部） |
| 发布手册、通道、发布后同步清单 | [`RELEASING.md`](RELEASING.md) |
| 分支策略、测试分层、文档权威分层 | [`../CONTRIBUTING.md`](../CONTRIBUTING.md)、[`../tests/README.md`](../tests/README.md) |
| 每条机制背后的真实事故 | [`../lessons.md`](../lessons.md) |

## 历史（保存当时事实，不改原文）

| 类别 | 文件 |
|---|---|
| 发布证据 | `V2.0.0-RELEASE-EVIDENCE-2026-09-05.md`（当前 `latest`）、`V2.0.0-BETA.1～5-RELEASE-EVIDENCE-*.md`、`V1.21-RELEASE-EVIDENCE-2026-08-25.md`、`WP4.3-RELEASE-EVIDENCE-2026-08-25.md` |
| v2 规划与决策 | [`V2-PLAN.md`](V2-PLAN.md)（执行基线，已交付）、[`V2-PROPOSAL.md`](V2-PROPOSAL.md)、[`V2-DECISIONS.md`](V2-DECISIONS.md)、[`V2-D2-DECISION-CARD.md`](V2-D2-DECISION-CARD.md)、[《BuildBeat v2：AI 原生软件交付控制平面》](BuildBeat%20v2%EF%BC%9AAI%20%E5%8E%9F%E7%94%9F%E8%BD%AF%E4%BB%B6%E4%BA%A4%E4%BB%98%E6%8E%A7%E5%88%B6%E5%B9%B3%E9%9D%A2.md) |
| v2 迭代与里程碑记录 | `V2-ITERATION-01～08.md`、[`v2/`](v2/) 下的 M1/M2/M4 验收与试点记录 |
| v1 路线与阶段试点 | [`ROADMAP.md`](ROADMAP.md)、[`EXECUTION-PLAN.md`](EXECUTION-PLAN.md)、`PHASE1/2/4-*.md`、[`CLI-STRATEGY-2026-08.md`](CLI-STRATEGY-2026-08.md)、[`CLI-PILOT-2026-08-23.md`](CLI-PILOT-2026-08-23.md)、[`PHASE4-STABILITY-AUDIT-2026-08-25.md`](PHASE4-STABILITY-AUDIT-2026-08-25.md) |

历史文件里的版本号、通道与测试数字是它们日期当天的事实，出现"`latest` 留 v1"之类的旧策略是正常的；判断现状只看现行文档与 registry 回读（`npm view @haiyangbg/buildbeat dist-tags`）。
