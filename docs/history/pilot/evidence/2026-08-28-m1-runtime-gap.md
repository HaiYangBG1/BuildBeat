# M-1 运行缺口证据：激活失败、F5 与 F6

> 日期：2026-08-28
> 对象：BuildBeat v2 M-1 `pilot/loop.sh`
> 结论上限：本地 fixture 与真实流程观察；不等于 v2 内核已实现，不等于真实任务自动 Loop 通过

## 1. 为什么补这份证据

`V2-D1A` 已要求 AI 试点工作区的下一项自然任务从干净 oracle 进入 `pilot/loop.sh`。随后 `WP-B1-AUTHZ` 又由当前会话直接人工推进到 Gate3 写者 L4：meta 分支 `codex/wp-b1-authz-gate2-5` 的最新记录为 `9d258ee`，但没有 Run 登记、自动 attempts ledger、恢复点或 Approval 对象。用户在下一轮询问中主动指出主线应是升级 BuildBeat v2，才把目标拉回。

这项业务推进不倒算为第三个合格自动 Run；它保留为第三次“真实任务发生，但 Loop 没有被激活”的负向证据。pilot-app、Tide 与本次 AI 试点工作区任务均重复了同一缺口：协议工件存在，不会自动触发 Runner，人仍是节拍器。

## 2. F5：验证中断后的恢复

执行：`npm run test:pilot` 中的 disposable Git fixture 让 Builder 先产生候选，再由 Verify 进程向父 Loop 发送 `TERM`；随后在同一现场重新调用 `pilot/loop.sh`。

结果：

- 首次进程非零终止；候选与运行日志留在工作区。
- 第二次启动返回 `2`，明确报错“开跑前工作树必须完全干净”。
- 没有 checkpoint、Run ID、事件 ledger、reducer 或 `resume` 入口，系统无法判断应继续 Verify、回到 Build，还是废弃候选。

判定：`SAFE_BLOCK / RECOVERY_MISSING`。它证明当前脚本不会在模糊现场静默续跑，但 F5 所要求的可恢复能力不存在，必须由人读现场并决定。

## 3. F6：Approval stale

执行：同一 fixture 先完整到达 `WAITING_HUMAN`，再检查 evidence 并改变候选。

结果：

- 运行只记录交互式 plan digest；没有绑定 `transition + candidate + planDigest + evidenceDigest` 的持久化 Approval/Decision 对象。
- `WAITING_HUMAN` 后改变候选，不会产生 `APPROVAL_STALE` 事件；因为没有常驻状态机，也没有可供重放的审批状态。
- 当前只读 reviewer 指纹可以作为审查时点证据，但不能替代审批对象与自动失效机制。

判定：`APPROVAL_STALE_MISSING`。F6 不再是 `UNVERIFIED`；已确认当前 pilot 不具备该能力。

## 4. 可复核命令与结果

```text
npm run test:pilot
15 passed, 0 failed

shellcheck pilot/loop.sh tests/pilot-loop.test.sh
git diff --check
```

其中新增四个 characterization 断言明确使用 `capability MISSING` / `no recoverable checkpoint` 文案；测试通过只表示缺口被稳定、可复现地观测并且系统 fail-closed，不表示 F5/F6 功能通过。

## 5. 对 `V2-D2` 的含义

- 三次真实工作均由人记得并手工编排，自动 Loop 激活率为 `0/3`；这不是 attempts 成功率，不能包装成有效 run ledger。
- 暂定可组装能力加权覆盖率仍为 `45.8%（5.5/12）`，低于薄内核分叉的 `80%` 门槛。
- F5 恢复和 F6 Approval stale 均已从 `UNVERIFIED` 收敛为 `MISSING`。
- “工件接受自动触发下一阶段”若仍依靠人想起来运行脚本，就没有兑现 v2 的核心承诺；该缺口超出既定三项薄内核范围，需要至少有 Run/事件/恢复/调度纵切。

因此形成 `V2-D2` 推荐：选择完整内核路线，按 M0→M1 先做最小纵切；是否正式关闭 M-1、进入 M0 仍由项目所有者拍板。
