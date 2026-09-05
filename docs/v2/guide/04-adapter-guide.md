# Adapter 指南

权威：[`RFC-0002 §Adapter`](../RFC-0002-domain-model.md)；实现：`src/v2/adapters/shell.js`（生产用）、`src/v2/adapters/mock.js`（测试用）。裁决 #5：厂商中立——不绑定任何 Agent 供应商。

## Shell Adapter：一切 CLI 皆 Worker

run 配置的 `workers.<角色>` 就是一份 Shell Adapter 配置：

```yaml
workers:
  builder:
    command: codex
    args:
      - exec
      - -s
      - workspace-write
      - <prompt 或脚本参数>
    timeoutMs: 900000
```

- 执行目录 = 该步的隔离 worktree（不是主检出）；
- `args` 支持模板：`{workspace}` `{step}` `{worker}`；
- 已实证的 Worker：`codex exec`（M4 四个真实试点）、任意 bash 脚本；`claude -p` 同构可换。

## env 白名单（默认，能力移除的一部分）

Worker 子进程默认**只**拿到 `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`——宿主 shell 里的云凭据、token 环境变量物理到不了 Worker。`inheritEnv: true` 可显式打开（doctor 会把它标为仅 ADVISORY 隔离）；单个变量可用 `env:` 白名单式注入。

## 输入输出

- 输入：`BUILDBEAT_INPUT` 环境变量携带 JSON（step/worker/candidate/失败摘要等，按角色见 [Worker 合同](05-worker-contract.md)）；
- 输出：需要结构化结果的步（reviewer 等）从 `BUILDBEAT_OUTPUT` 指向的路径写 JSON 信封；codex 用 `-o` 落最后消息再由包装脚本转写也可以；
- 纯命令步（verifier 跑测试）不需要信封——退出码与日志由 Runner 回读为证据。

## 结果语义

Adapter 只报告事实：exitCode / signal / timedOut / spawnError / stdout / stderr / 起止时间。写事件的是 Orchestrator，Adapter 永不触碰内核状态。超时、崩溃、无法启动分别落 `timeout` / `crashed` / 失败路径，都有端到端测试（`tests/v2-invariants.test.js`）。

## Mock Adapter

`createMockAdapter(script)`：按步给定 `"succeed"`/`"fail"` 或 `{behavior, envelope}` 序列，用于测试与 evals；行为卡见 [`evals/`](../../../evals/README.md)。

## 何时写专用 Adapter

只有当 Shell 表达不了（需要流式交互、会话保持）才写专用 Adapter；按 M3 裁决，先用 Shell 接一切，等真实试点证明不够再说。

## 实时输出（迭代 08）

编排器给 Shell Adapter 传 `liveDir` 时，子进程的 stdout/stderr 直接写到 `<liveDir>/<step>-<attempt>.{stdout,stderr}.live`（fd 直连，不经父进程缓冲），并写 `live.json`（`step / attempt / worker / command / startedAt`）。步返回后 Adapter 读回两份流作为 `stdout` / `stderr`，删掉实时文件——结果形状不变，证据收集器照旧。自写 Adapter 若想被 `status` 的"最后输出距今"识别，产出同名文件即可；不产出则 `status` 只显示已用时间。
