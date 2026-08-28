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

在途步会以 `crashed` 关闭（事实落账），从最近 checkpoint 继续；带批准恢复时会做 candidate/plan 新鲜度检查，变了即 `APPROVAL_STALE` 转人工。恢复不了就删 runtime 重跑——候选分支与 Git 面记录不丢。

### 锁卡住（"another run is active"）

上一个 Run 异常退出可能留下仓库锁：确认真的没有活动 Run 后

```bash
buildbeat-v2 stop --repo . --run RUN-X --reason "crashed; releasing lock"
```

`stop` 落终态与理由；单纯锁残留也可删 `.buildbeat/runtime/` 后重来。

### Worker 行为异常

- 输出不是信封 → `invalid-output` 按失败重试，连续同指纹自动停：修 prompt/包装脚本再 resume；
- 越界写入 → Run BLOCK 且不固定 candidate：检查 `allowedPaths` 与 Worker prompt 的范围声明；
- 超时 → 调 `timeoutMs`；超预算 → 这是刹车不是故障，人工看完再决定加预算或收 scope。

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

`buildbeat-v2 doctor --config <run-config>`：配置可解析、workflow 无出口环、adapter env 姿态、digest 可算。`events`/`replay`/`metrics` 全部只读，可随时跑。
