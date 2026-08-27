# M-1 第三目标项目摸底：AI 底座

> 日期：2026-08-28
> 状态：**已观察到第三次自动激活失败；仍未形成有效自动 run**
> 授权来源：项目所有者明确指定 `AI底座/底座` 作为第三个真实例子

## 为什么选它

- 开发活跃，存在连续的真实工作包、Gate、独立测试、reviewer 与非生产/生产证据，不需要制造演示需求。
- 是 meta + `ruoyi-ai` + `chickDEV` + 其它子仓的多仓项目，能直接验证 v2 当前最薄弱的跨 workspace 证据绑定。
- 从 legacy Solobaton 迁来，目标工作树当前记录 BuildBeat `v1.21` 手工语义迁移，但没有 schema 2 `.buildbeat/manifest.json`，适合验证旧项目旁路接入，而不是只验证全新项目。

## 2026-08-28 只读事实

### BuildBeat 基线

- `BUILDBEAT.md` 当前工作树声明 `v1.21`，但相对 `HEAD` 的 diff 表明已提交基线仍是 `v1.20`；v1.21 的 `AGENTS.md` / `BUILDBEAT.md` 增量尚未提交。
- 目标项目明确记录：历史没有 CLI 写入的 schema 2 manifest，`buildbeat doctor` 应报告 `manifest.missing`，后续只能按所有权手工语义合并，不能伪造机械升级基线。
- BuildBeat 的 `v2` 开发分支当前仍使用 package version `1.21.0`，最新发布 tag 也是 `v1.21.0`；没有可供目标项目安装的 v2 tag 或预发布包。因此本轮不存在“把目标项目直接升级到 v2”这一步。

### 项目现场

- meta 仓：`main` 相对 `origin/main` ahead 83，且 `AGENTS.md`、`BUILDBEAT.md` 与运维脚本存在在途修改；`bus-check` 还生成了未跟踪的 Python cache。试点不得覆盖或顺手提交这些用户改动。
- `ruoyi-ai` 当前主 worktree 有另一工作项的 4 个在途文件；`chickDEV` main 相对远端 ahead 3。两个仓另有 clean 的 `codex/wp-b1-authz` worktree。
- `bus-check` 本次只证明本地总线可解析；它同时报告 L3 marker stale、四个子仓未登记多仓 map、live-status 失败、生产只读未授权和 drift coverage 不完整，不能外推成线上/生产已验证。

### 当前真实工作包

- `WP-B1-AUTHZ` exact candidate：
  - backend `ruoyi-ai@7685836a313d6a23a58cf697731850d05fdc6692`
  - frontend `chickDEV@f2ee3450206b1d16e50f61b86b199e6ec58e7127`
- `WP-B1-AUTHZ` 后续已在独立 meta 分支 `codex/wp-b1-authz-gate2-5` 推进到 `9d258ee`：Gate2.5 通过，`G3-AUTHZ-00～04=WRITER_PASS`，当前下一 owner 为测试域独立复跑。
- 这段推进发生在 `V2-D1A` 之后，但没有进入 `pilot/loop.sh`，因此不倒算为自动 Run；它证明接力描述修正了，自动激活/ledger/恢复问题仍未解决。证据归纳见 [`../evidence/2026-08-28-m1-runtime-gap.md`](../evidence/2026-08-28-m1-runtime-gap.md)。

## 第三个有效 run 的进入条件

1. 使用该项目下一项自然发生、已经项目自身 Gate 授权的低风险非生产开发任务；不回改 `WP-B1-AUTHZ`，不另造演示需求。
2. 先按目标项目自身规则关闭或明确隔离现有工作包；相关仓库从 clean、可复现的 oracle commit 建立 `pilot/*` worktree。
3. `ACCEPT_CMD` 在基线必须失败，回归命令独立；intent、plan、oracle 与 protected paths 先提交。
4. 若任务跨 meta/backend/frontend，多仓 candidate、plan digest 与 approval 必须被同一 run 显式绑定。当前单仓 `loop.sh` 做不到时应阻断并登记缺口，不能只跑一个仓后声称整包完成。
5. Agent 不持有生产、push、merge、migration 或部署能力；F5 中断恢复与 F6 Approval stale 在这轮真实执行中补测。

## 明确不做

- 不在目标项目当前工作树执行 v2 in-place 升级，不补造 `.buildbeat/manifest.json`。
- 不修改、提交或清理目标项目现有脏文件与 worktree。
- 不把历史 commits、测试报告或 reviewer 记录倒算为 `pilot/loop.sh` 的 attempts/ledger。
- 不因选择该项目而获得 Gate2.5、Gate3、push、merge、migration、部署或生产授权。
