# 故障恢复手册

设计前提（[`V2-PLAN.md`](../../V2-PLAN.md) 不变量 23）：**`.buildbeat/runtime/` 整个目录随时可删**——已接受工件、Decision、Intent 草稿与分诊、已终结 Run 的压实记录全部活在 Git 面。"删了重建"是默认排障手段，不是最后手段。

## 症状 → 处置

### 台账报 corrupted

`status`/`inbox` 出现 `LEDGER CORRUPTED after seq=N (<原因>)`：台账在最后一条合法事件处截断视图并**拒绝追加**——恢复是人的决定，不静默修复。

1. `buildbeat-v2 events --repo . --run RUN-X` 看合法前缀；`replay` 校验归约；
2. 若坏的是在途 Run：通常直接废弃该 Run（worktree 里的候选仍在分支上可读），新起一个 Run；
3. 若人为改过台账文件：从 Git 面事实重建判断，不要手补事件行。

### Run 进程被杀 / 机器重启

```bash
buildbeat-v2 resume --config <run-config.yaml>
```

在途步会以 `crashed` 关闭（事实落账），然后**重跑该步本身**（beta.3 改）：进程死掉不说明候选有问题，丢失的那次尝试照常计入该步预算，预算耗尽即停人工。此前的语义是把 crash 当步骤失败走 failure 边——真实事故（deploy-18）：宿主工具超时杀掉 verify worker，crash 被路由去 fix，fixer 面对零 verifier 证据白烧一轮。工作树脏了仍然先停人工。带批准恢复时会做 candidate/plan 新鲜度检查，变了即 `APPROVAL_STALE` 转人工。恢复不了就删 runtime 重跑——候选分支与 Git 面记录不丢。

**启动纪律**（同一事故的另一半）：长于分钟级的 Run 必须以脱离宿主工具超时的方式启动（`nohup`/`setsid`），交互式 shell 里 `start` 会打印这条提醒。

### 锁卡住（"another run is active"）

上一个 Run 异常退出可能留下仓库锁：确认真的没有活动 Run 后

```bash
buildbeat-v2 stop --repo . --run RUN-X --reason "crashed; releasing lock"
```

`stop` 落终态与理由；单纯锁残留也可删 `.buildbeat/runtime/` 后重来。

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

`buildbeat-v2 doctor --config <run-config>`：配置可解析、workflow 无出口环、adapter env 姿态、digest 可算、supersede 与 stall 阈值、通知通道与环境变量是否就位。`events`/`replay`/`metrics` 全部只读，可随时跑。

## "是不是卡住了"（迭代 08）

先看 `buildbeat-v2 status --repo . --run <RUN>`：在飞步骤有已用时间、同仓历史中位数、worker 命令、最后一次输出距今多久与末三行输出。无输出超过阈值（默认 15 分钟，`--stall-after <分钟>` 或 run 配置 `stallAfterMs`）标 `STALLED`——**只标不杀**。判断口径：

- 有输出在持续 → 等（对照 `typical` 看是否已远超中位数）；
- STALLED 且 worker 是 Agent CLI → 多半在长推理或等一个永远不来的交互，`stop --reason` 后按崩溃恢复重跑（中断的步重跑自身）；
- STALLED 且 worker 是脚本 → 看末三行，通常是等外部资源（端口、锁、网络）。

想不盯屏就订阅 `STALLED` 通知（[Approval 指南](07-approval-guide.md)）。`watch --repo . --run <RUN> --once true` 可手工探测一次。

## 打扫卫生：gc（迭代 08）

终态 Run 会留下工作树、`run/*` 分支和偶尔的锁。`buildbeat-v2 gc --repo .` 默认只出计划，`--apply true` 执行：

- 只动**终态且已压成 run-record** 的 Run（Git 面有账才动运行时面）；
- 工作树可删（提交都在分支上）；脏工作树不带 `--force true` 不动；
- 分支只在候选**已可从其他 ref 到达**（已合并 / 打 tag / 在远端）或 Run 未产出候选时删；否则明示"仅此分支可达，保留"——它是证据的最后一根线；
- 终态 Run 的残留 `locks/<RUN>.lock` 一并清；`active-run` 锁仍按上文人工处置。

gc 永不写台账（终态后只允许 `RUN_COMPACTED`），所以随时可跑、可重复。
