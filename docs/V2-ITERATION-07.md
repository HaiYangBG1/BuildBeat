# v2 迭代 07：M5 闭环起步、迁移与 Beta

> 状态：**已完成——M5 于 2026-08-28 关闭**（T1–T5 全部完成；`2.0.0-beta.1` 已发布到 dist-tag `next`，发布证据：[`v2.0.0-beta.1 evidence`](V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md)）
> 上游：[`V2-PLAN.md`](V2-PLAN.md) §8 M5；M4 收尾：[`V2-ITERATION-06.md`](V2-ITERATION-06.md)
> 时间盒：**≤3 周**；授权边界沿用 `V2-D2=A`（仅本地 `v2` 分支，不含 push、merge、tag、部署）；**`npm publish 2.0.0-beta.1` 是独立生产动作，须所有者单独授权后执行**

## 任务清单

- [x] **T1 observe v0（RFC-0003 §8 冻结契约的实现）**：
  - `observe.yaml` 解析与校验（yaml-subset，fail-closed；bands 固定 log/diagnose/intent 三层，`triage.actions` 固定，`dismissFeedback: bands`）；
  - Provider 执行（单周期 `observe run`；调度 v0 交给宿主 cron，见边界）→ 产出满足 Evidence Contract 的记录（采不到即 `unverified`，永不静默）→ 复用 `EVIDENCE_RECORDED` 进独立 observe 台账（同一 EventLedger 机制，链校验一致）；
  - bands 分层：log（只落账）→ diagnose（触发配置的**只读**诊断命令，产出 `diagnosis` 证据）→ intent（**草稿**入队 Git 面 `delivery/observe/intents/`，绝不自动执行）；
  - 人分诊 `observe triage`：fix_now / schedule / dismiss；**dismiss 回调 bands**——同指纹被 dismiss 后不再重复出 intent 草稿（除非严重度升级），分诊终态写在 Git 面草稿文件里（不变量 23：删 runtime 不丢分诊记忆）；
  - 新事件类型 additive 注册（SPEC-0001 演进规则）：`BAND_TRIGGERED` / `INTENT_DRAFTED` / `TRIAGE_RECORDED`；
  - 测试：配置 fail-closed、unverified 传导、band 路由、intent 只入队不执行、dismiss 反馈、runtime 可删。
- [x] **T2 v1→v2 迁移 runbook（半天手工，WP6.2 原则）**：只读分析 v1 → 草稿 → 人工确认活动 Work → 冻结旧看板 → 新工作只进 v2 → 归档不双写 → 一个真实 Run 后才正式切换；装机量 N=1，不写 importer 工具。→ [`guide/08-migration-v1.md`](v2/guide/08-migration-v1.md)
- [x] **T3 文档十件套（WP6.3）**：快速开始 / Workflow 编写 / Policy / Adapter / Worker 合同 / Evidence / Human Approval / v1 迁移（=T2）/ 安全与权限边界 / 故障恢复，落 [`docs/v2/guide/`](v2/guide/README.md)。
- [x] **T4 Beta 打包准备**：`package.json` 版本 `2.0.0-beta.1`、`bin/buildbeat-v2.js` 入口、`files` 覆盖 `src/v2/`、`pack:check` 通过、v1 全套测试保持绿（v1 只冻结不删除，`latest` 不动）。文档一致性守卫（`tests/check_docs.py`）教会识别 prerelease 版本号（additive），教学快照/CLI 契约/RELEASING 版本联动完成。
- [x] **T5 发布 `@haiyangbg/buildbeat@2.0.0-beta.1`（dist-tag `next`）**：所有者授权（"发布吧，授权也一起"）后经 GitHub Actions OIDC Trusted Publishing 完成；prepublish 门抓出并修正 3 个真实缺陷（发布脚本 dist-tag 契约、v1 cliVersion prerelease 校验、SCAFFOLD_VERSION 虚构跨大版本升级）；`latest` 未动；独立回读五项全过。证据：[`V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md`](V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md)。

## 完成定义

T1 测试全绿并入 `npm test` 单入口；T2/T3 文档齐十件且互链自洽；T4 `pack:check` 与全套测试通过；T5 授权前 M5 停在"beta-ready"，授权后发布并回填证据。

## 进展（2026-08-28）

- **T1**：`src/v2/observe/`（config fail-closed / runner / reducer / triage）+ 3 个 additive 事件类型（`BAND_TRIGGERED`/`INTENT_DRAFTED`/`TRIAGE_RECORDED`，`EVIDENCE_RECORDED` 复用即"同一 Evidence Contract 与台账"的冻结语义）；`EventLedger` reducer 可插拔（additive，默认行为不变）；`tests/v2-observe.test.js` 8 项覆盖 fail-closed/unverified 传导/band 路由/只入队/dismiss 反馈/不变量 23/链纪律。全量 `npm test` **139/139 绿**（观测新增前 131，零回归）。
- **Self-host 试点**：本仓库真实接入（[`.buildbeat/observe.yaml`](../.buildbeat/observe.yaml)，探针=`tests/check-docs.sh` 文档漂移守卫）——cycle 1 真实跑通，`docs-drift: passed` 证据入账（`EVIDENCE_RECORDED`，digest 在 observe 台账），无误报、无草稿。
- **T4 核验**：`check:docs` 162 文件全绿；`pack:check` 出包 `2.0.0-beta.1`（141 文件）；`buildbeat-v2` bin 冒烟通过（usage / observe 三子命令 / 错误路径）。
- **T5 未做**：`npm publish` 是生产动作，等待所有者授权（届时 `prepublishOnly` 会再整套跑一遍作为发布门）。

## v0 边界（如实声明）

- Provider `schedule` 字段按冻结 schema 解析并落账，但 v0 不内置调度器——周期运行由宿主（cron / CI / 手动）反复调 `observe run` 实现；
- diagnose 层 v0 执行配置的只读诊断命令（env 白名单继承 Shell Adapter 纪律），不是完整 fresh-context Agent Worker；
- fix_now / schedule 的后续（把接受的 Intent 带进 `software-delivery` Run）v0 由人工发起，CLI 打印建议命令。
