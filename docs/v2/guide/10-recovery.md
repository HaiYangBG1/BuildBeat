# 故障恢复手册

**简体中文** | [English](10-recovery.en.md)

设计前提（[`V2-PLAN.md`](../../history/V2-PLAN.md) 不变量 23）：**`.buildbeat/runtime/` 整个目录随时可删**——已接受工件、Decision、Intent 草稿与分诊、已终结 Run 的压实记录全部活在 Git 面。"删了重建"是默认排障手段，不是最后手段。

## 症状 → 处置

### 「run config … has N problem(s)」

run 配置写错了，Run 没有起跑、什么都没改。按清单逐条改（每条写明是哪个键、错在哪、最接近的正确拼写），改完再跑同一条命令；`buildbeat doctor --config …` 可以先单独核对。

### 台账报 corrupted

`status`/`inbox` 出现 `LEDGER CORRUPTED after seq=N (<原因>)`：台账在最后一条合法事件处截断视图并**拒绝追加**——恢复是人的决定，不静默修复。

1. `buildbeat events --repo . --run RUN-X` 看合法前缀；`replay` 校验归约；
2. 若坏的是在途 Run：通常直接废弃该 Run（worktree 里的候选仍在分支上可读），新起一个 Run；
3. 若人为改过台账文件：从 Git 面事实重建判断，不要手补事件行。

### Run 进程被杀 / 机器重启

```bash
buildbeat resume --config <run-config.yaml>
```

使用 `start --attempt new` 自动编号时，`resume --config <run-config.yaml>` 会续跑该家族唯一未终态的 Run，并打印选中的 ID；也可用 `--run <RUN-ID>` 显式指定配置中的 Run 本身或 `<家族>-NN`（数字至少两位）。配置本身已有台账时优先使用该精确 ID。多个未终态 Run 会列出候选并要求用 `--run` 选择；没有未终态 Run 会报告最新一次的 ID 和终态，没有台账则明确说明。

在途步会以 `crashed` 关闭（事实落账），然后**重跑该步本身**（beta.3 改）：进程死掉不说明候选有问题，丢失的那次尝试照常计入该步预算，预算耗尽即停人工。此前的语义是把 crash 当步骤失败走 failure 边——真实事故（deploy-18）：宿主工具超时杀掉 verify worker，crash 被路由去 fix，fixer 面对零 verifier 证据白烧一轮。工作树脏了仍然先停人工。带批准恢复时会做 candidate/plan 新鲜度检查，变了即 `APPROVAL_STALE` 转人工。恢复不了就删 runtime 重跑——候选分支与 Git 面记录不丢。

**启动纪律**（同一事故的另一半）：长于分钟级的 Run 必须以脱离宿主工具超时的方式启动（`nohup`/`setsid`），交互式 shell 里 `start` 会打印这条提醒。

### 锁卡住（"another run is active"）

每把锁记录持有者（进程号、主机名、获取时间、命令）。驱动进程被杀、被宿主超时结束或机器重启后，锁会残留；下一次 `resume` / `stop` / `start` 拿锁时，若持有者**在本机且进程已不存在**，自动回收并打印 `reclaimed stale lock <id> (owner pid … is gone)`，无需手删任何文件。所以驱动被杀后直接：

```bash
buildbeat resume --config <run-config.yaml>
```

内核走上文的崩溃恢复（`RUN_INTERRUPTED` → 重跑中断步）；不想续跑就 `buildbeat stop --repo . --run RUN-X --reason "…"`。

只有三种情况仍会报 `another run is active` / `already locked`，报错里写明持有者：

- **持有者还活着**：另一个 Run 真的在跑，等它结束；确认它卡死再结束该进程；
- **持有者在别的主机**（共享盘上的仓库）：到那台机器处理，本机不会替它回收；
- **没有持有者信息**：旧版本 buildbeat 留下的锁，或拿锁瞬间崩溃；确认没有 buildbeat 进程在跑后，删除报错里给出的那个锁目录。

### 台账「changed on disk since it was read」

`ledger for RUN-X changed on disk since it was read (another writer); re-read it and retry`：另一个会话或进程刚好在你之前写了同一个 Run 的台账（例如两边同时批准、一边 `stop` 一边 `resume`）。内核拒绝了这次写入，**台账没有被改动、也没有损坏**；重新执行同一条命令即可，它会基于最新状态重新判断（可能直接告诉你「已经批过了 / 已终态」）。批准、拒绝、`--adopt`、`stop`、`resume` 与自动取代都在拿到 Run 锁之后才读台账，正常使用不会遇到这条报错；看到它说明确实有并发操作。

### Worker 行为异常

- **worker 基础设施故障（迭代 09）**：超时、崩溃、输出不是信封（`invalid-output`）、或 worker 自己以退出码 **75**（`EX_TEMPFAIL`，"环境不可用"）结束——内核判为 `infra`：不记失败指纹、不派 fixer、**不扣该步预算**，停 `WAITING_HUMAN`（kind `infra`，transition `resume-<step>`），通知照常出站。后端恢复后 `approve --transition resume-<step>` 重跑该步；`reject` 结束 Run。真实事故：worker 服务端 404 与非 JSON 输出两天杀掉 5 个 Run，驾驶会话手写探针每两分钟试一次；PATH 缺 rg、端口撞车、宿主负载 280 各派了一次 fixer。
- **没有转移边的失败**（如预设里 build / review / fix 的 `failed`）不再终态 FAILED，同样停 `resume-<step>` 由人决定重跑或结束。
- 越界写入 → Run BLOCK 且不固定 candidate：检查 `allowedPaths` 与 Worker prompt 的范围声明；
- 超时 → 先看是不是环境（`infra` 已停人），再调 `timeoutMs`；超预算 → 这是刹车不是故障，批准 `resume-<step>` 即多给一次，或收 scope。

### observe 面

- 探针一直 `unverified`：先修探针可达性——unverified 是"采不到"，不是"没问题"；
- 误报刷屏：`observe triage --action dismiss`，同指纹在严重度升级前不再入队；
- 删了 runtime 后 observe 周期数归零：正常——分诊记忆在 Git 面草稿里，抑制照常生效（有测试）。

### 一切都乱了

```bash
rm -rf .buildbeat/runtime/
```

然后从 Git 面重新出发。任何"长期度量/终态解释依赖 runtime"的现象都是 bug，请报告。

## 诊断入口

`buildbeat doctor --config <run-config>`：配置可解析、workflow 无出口环、adapter env 姿态、digest 可算、supersede 与 stall 阈值、通知通道与环境变量是否就位。`events`/`replay`/`metrics` 全部只读，可随时跑。

## "是不是卡住了"

> 自 2.0.0-beta.4（迭代 08）起。
先看 `buildbeat status --repo . --run <RUN>`：在飞步骤有已用时间、同仓历史中位数、worker 命令、最后一次输出距今多久与末三行输出。无输出超过阈值（默认 15 分钟，`--stall-after <分钟>` 或 run 配置 `stallAfterMs`）标 `STALLED`——**只标不杀**。判断口径：

- 有输出在持续 → 等（对照 `typical` 看是否已远超中位数）；
- STALLED 且 worker 是 Agent CLI → 多半在长推理或等一个永远不来的交互，`stop --reason` 后按崩溃恢复重跑（中断的步重跑自身）；
- STALLED 且 worker 是脚本 → 看末三行，通常是等外部资源（端口、锁、网络）。

想不盯屏就订阅 `STALLED` 通知（[Approval 指南](07-approval-guide.md)）。`watch --repo . --run <RUN> --once true` 可手工探测一次。

## 打扫卫生：gc

> 自 2.0.0-beta.4（迭代 08）起。
终态 Run 会留下工作树、`run/*` 分支和偶尔的锁。`buildbeat gc --repo .` 默认只出计划，`--apply true` 执行：

- 只动**终态且已压成 run-record** 的 Run（Git 面有账才动运行时面）；
- 工作树可删（提交都在分支上）；脏工作树不带 `--force true` 不动；
- 分支只在候选**已可从其他 ref 到达**（已合并 / 打 tag / 在远端）或 Run 未产出候选时删；否则明示"仅此分支可达，保留"——它是证据的最后一根线；
- 终态 Run 的残留 `locks/<RUN>.lock` 一并清；`active-run` 锁在持有者进程已不存在时一并回收（计划里写明持有者），持有者还活着 / 在别的主机 / 没有持有者信息时保留并说明原因。

gc 永不写台账（终态后只允许 `RUN_COMPACTED`），所以随时可跑、可重复。
