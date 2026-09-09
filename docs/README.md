# docs/ 总入口

> 这一页只回答"我该读哪份"。文件按**现行**与**历史**分开：现行文档描述今天的包（`@haiyangbg/buildbeat@latest`）并受 `tests/check_docs.py` 的时效检查约束；历史文档保存当时的事实与数字，只加状态说明、不改原文。

## 现行：用户读

| 你要做什么 | 读 |
|---|---|
| 第一次用，在 AI 会话里 | [`v2/guide/00-how-to-talk.md`](v2/guide/00-how-to-talk.md) → 会话读 [`SKILL.md`](../SKILL.md) §0.5 |
| 第一次用，自己敲命令核对 | [`v2/guide/01-quickstart.md`](v2/guide/01-quickstart.md) |
| 指南索引（日常 / 配置） | [`v2/guide/README.md`](v2/guide/README.md) |
| 关闭旧会话后继续，或由其他成员/工具接手 | [`跨会话接续`](v2/guide/11-session-handoff.md) · [English](v2/guide/11-session-handoff.en.md) |
| 三个可用面各能做什么（Skill-only / 运行时 / 插件） | [`CAPABILITY-MATRIX.md`](CAPABILITY-MATRIX.md) |
| 项目装载入口与信封模板 | [`../templates/v2/`](../templates/v2/AGENTS.md) |
| 填好之后长什么样：一个 Work 跑到合并决定的快照 | [`../example/`](../example/README.md) |

## 现行：规范与维护

| 内容 | 读 |
|---|---|
| 产品定位 / 域模型 / workflow 与 policy / 事件 schema | [`v2/RFC-0001`](v2/RFC-0001-product-definition.md) / [`RFC-0002`](v2/RFC-0002-domain-model.md) / [`RFC-0003`](v2/RFC-0003-workflow-policy.md) / [`SPEC-0001`](v2/SPEC-0001-events-v1.md)（`FINAL`；带日期的生效修订写在正文顶部） |
| 发布手册、通道、发布后同步清单 | [`RELEASING.md`](RELEASING.md) |
| 分支策略、测试分层、文档权威分层 | [`../CONTRIBUTING.md`](../CONTRIBUTING.md)、[`../tests/README.md`](../tests/README.md) |
| 每条机制背后的真实事故 | [`../lessons.md`](../lessons.md) |

## 历史（保存当时事实，不改原文）

| 类别 | 文件 |
|---|---|
| 发布证据 | `V3.0.0-RELEASE-EVIDENCE-2026-09-09.md`（当前 `latest`）、`V2.0.2-RELEASE-EVIDENCE-2026-09-09.md`、`V2.0.1-RELEASE-EVIDENCE-2026-09-06.md`、`V2.0.0-RELEASE-EVIDENCE-2026-09-05.md`、`V2.0.0-BETA.1～5-RELEASE-EVIDENCE-*.md`、`V1.21-RELEASE-EVIDENCE-2026-08-25.md`、`WP4.3-RELEASE-EVIDENCE-2026-08-25.md` |
| 规划与决策（2026-08） | [`V2-PLAN.md`](V2-PLAN.md)（执行基线，已交付）、[`V2-PROPOSAL.md`](V2-PROPOSAL.md)、[`V2-DECISIONS.md`](V2-DECISIONS.md)、[`V2-D2-DECISION-CARD.md`](V2-D2-DECISION-CARD.md)、[《BuildBeat v2：AI 原生软件交付控制平面》](BuildBeat%20v2%EF%BC%9AAI%20%E5%8E%9F%E7%94%9F%E8%BD%AF%E4%BB%B6%E4%BA%A4%E4%BB%98%E6%8E%A7%E5%88%B6%E5%B9%B3%E9%9D%A2.md) |
| 迭代与里程碑记录 | `V2-ITERATION-01～08.md`、[`v2/`](v2/) 下的 M1/M2/M4 验收与试点记录 |
| 早期版本史 | [`../CHANGELOG-v1.md`](../CHANGELOG-v1.md)（2026-06 ～ 2026-08 的条目原文；当前条目在根 [`CHANGELOG.md`](../CHANGELOG.md)） |
| 早期路线与阶段试点（2026-08，已移除的文件总线时代） | [`ROADMAP.md`](ROADMAP.md)、[`EXECUTION-PLAN.md`](EXECUTION-PLAN.md)、`PHASE1/2/4-*.md`、[`CLI-STRATEGY-2026-08.md`](CLI-STRATEGY-2026-08.md)、[`CLI-PILOT-2026-08-23.md`](CLI-PILOT-2026-08-23.md)、[`PHASE4-STABILITY-AUDIT-2026-08-25.md`](PHASE4-STABILITY-AUDIT-2026-08-25.md) |

历史文件里的版本号、通道与测试数字是它们日期当天的事实，出现已被移除的旧机制和旧通道策略是正常的；判断现状只看现行文档与 registry 回读（`npm view @haiyangbg/buildbeat dist-tags`）。

历史文件只保存在 GitHub 仓库里，不随 npm 包分发（`package.json` 的 `files` 显式排除）；从安装目录点开现行文档里指向历史文件的链接会落空，到 [`HaiYangBG1/BuildBeat`](https://github.com/HaiYangBG1/BuildBeat/tree/main/docs) 看即可。现行文档全部随包分发，`tests/pack-firstrun.test.sh` 守着这两条边界。
