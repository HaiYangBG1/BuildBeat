# v2 迭代 08：等待要能找到人（会话复盘回灌）

> 状态：**C1–C10 + Skill 驾驶手册已实现（源码在 `v2` 分支，未发布）**
> 上游：[`V2-PLAN.md`](V2-PLAN.md)；上一迭代 [`V2-ITERATION-07.md`](V2-ITERATION-07.md)；变更明细见 [`CHANGELOG.md`](../CHANGELOG.md) Unreleased
> 授权边界沿用 `V2-D2=A`（仅本地 `v2` 分支，不含 push、merge、tag、发布）；`npm publish 2.0.0-beta.4` 是独立生产动作，须所有者单独授权

## 输入：复盘了什么

- 底座 2026-08-28～09-02 的全部 Claude / Codex 驾驶会话（8-30「当前进度极其缓慢」、9-1「Codex 进度好像又卡住了」、9-2「当前代办是什么，从每一个系统的进度说」、9-1「这个服务名字怎么起的」）
- `ruoyi-ai` 与 `chickDEV` 两个子仓的 58 个 Run 台账（`buildbeat-v2 metrics` + 逐 Run events）
- `pm/2026-09-01-BuildBeat三十轮复盘.md`、`pm/2026-09-01-首证复跑卡点经验.md`、`pm/2026-08-31-验证优化与瘦身计划.md`
- 所有者 2026-09-02 两次拍板：「你说的我认可」（C1–C4 先做）→「继续下一轮，直到全部完成」；并指出**大部分人在其他 AI agent 里用 BuildBeat，Skill 才是真正入口，CLI 是被 Skill 调用的**

| 底座两个子仓的 Run | 数量 |
|---|---|
| 总数 | 58 |
| 成功 | 7 |
| 失败 | 17 |
| 取消 | 32（多数在 WAITING_HUMAN 挂满一天后批量清掉） |
| 人批平均等待 | 7～12 小时 |

结论：beta.3 吸收的是「审查循环烧钱」；这一周暴露的是另一族——**人看不见 Run 在干什么、看不见离目标还差多远、每开一个 Run 的手工成本**；以及 **AI 会话装载到的 Skill 还是 v1**。

## 任务清单

- [x] **C1 运行中可见性**：Shell Adapter 实时流式落盘 + `status` 耗时/历史中位数/最后输出/STALLED（只标不杀）+ `metrics` 每步中位耗时。→ `src/v2/adapters/shell.js`、`src/v2/runtime/liveness.js`
- [x] **C2 supersede**：同 Work 新 Run 起跑时旧的 `WAITING_HUMAN` 记 `SUPERSEDED`；`RUN_CREATED.data.supersedes`；`supersede: off`。→ `orchestrator.js`
- [x] **C3 gc**：`gc --repo .` / `--apply true` / `--force true`；分支仅候选可从其他 ref 到达或无候选时删。→ `src/v2/runtime/gc.js`
- [x] **C4 通知出站**：`.buildbeat/notify.yaml`（webhook|dingtalk，URL 只能 `urlEnv`）；`HUMAN_REQUESTED` / `RUN_TERMINAL` / `STALLED`；fail-open；`watch` 脱离进程。→ `src/v2/runtime/notify.js`
- [x] **C5 overview**：Work 级阶段机 + 下一步该谁；运行时删后由 run-record 补足。→ `src/v2/runtime/overview.js`
- [x] **C6 信封一等公民**：`envelope:`（prompts / vars / pin）→ `BUILDBEAT_PROMPT` + `input.envelope`；`start --attempt new` 自动编号；`redact:` 证据脱敏。→ `src/v2/runtime/envelope.js`、`collector.js`
- [x] **C7 verify 复用与增量审查**：`cache: {verify: tree}` 同树同命令同信封已通过即复用（`reused` 可见）；reviewer input `lastReviewed`。→ `src/v2/runtime/cache.js`
- [x] **C8 合并后车道**：预设 `release-readback` + 风险预设 `release`；workflow step `grade:`。→ `src/v2/presets/`
- [x] **C9 可见命名进决策卡**：v2 AGENTS 模板第 ⑪ 条、Skill §0.5.2、Worker 合同。
- [x] **C10 环境事实**：`requires:` `probe:` 条目；`env-facts.md` 约定（overview 显示）。→ `env-contract.js`
- [x] **Skill 驾驶手册**：`SKILL.md` §0.5（用户一句话 → 会话调什么 → 回什么；run-config 最小样板）+ frontmatter v2 触发词；`templates/v2/AGENTS.md`、`templates/v2/指挥台.md`。
- [x] **下一句该说什么**：`status` / `inbox` / `overview` / 通知附可复制命令（给会话用，不丢给用户）。
- [x] 文档：CHANGELOG、指南 01/02/04/05/06/07/10、SPEC-0001 additive 注记、lessons #20/#21。

## 完成定义

`npm test` 全绿（含新增 8 组测试）；`check:docs` 通过；对底座真实子仓跑 `gc`（计划模式）、`inbox`、`overview` 的输出符合预期且未改动任何东西（两个挂了 21 小时的 chickDEV 旧 Run 由所有者授权后 `stop`）。

## 边界（如实声明）

- **编排器仍同步**：worker 在 `spawnSync` 里跑，`STALLED` 的通知由独立 `watch` 进程完成；`status` 的 STALLED 判定不需要它。异步化（进程内看表、并行 Run）不在本迭代。
- **supersede 只碰 WAITING_HUMAN**；被另一进程锁住的旧 Run 跳过并明示。
- **gc 永不写台账**；候选仅此分支可达时分支一律保留。
- **通知不是审批通道**；钉钉走关键词模式，签名模式暂不支持。
- **verify 复用只看树、命令、信封**：verifier 若依赖树之外的东西（远端服务、时间），项目不要开 `cache`。
- **release 车道没有 finding 门**：车道里没有 reviewer，不设满足不了的规则；生产动作仍是人的（不变量 20）。
- **`overview` 的"已合入"只对当前 checkout 分支判定**（`merge-base --is-ancestor`），远端是否推送不在其内。
- **Skill 与 CLI 的关系**：Skill 是入口，CLI 是引擎；没装 CLI 时 §0.5 表格右列退化为会话手工维护同名文件，方法论不失效——但 Run 的机器强制（隔离 worktree、写者≠审者、digest 绑定）只有 CLI 才提供。

## 后续候选（未拍板）

| # | 项 | 一句话 |
|---|---|---|
| N1 | 编排器异步化 | 进程内 STALLED、并行 Run、去掉 `watch` 子进程 |
| N2 | `overview` 跨仓 | meta 仓一次看所有子仓的 Work（底座是 meta + 3 子仓） |
| N3 | 钉钉签名模式 | `secret` 也走 env，HMAC 签名 |
| N4 | Skill 的 Bootstrap v2 | §8 引导式 Bootstrap 直接生成 v2 骨架（`delivery/`、`.buildbeat/`、v2 AGENTS） |
