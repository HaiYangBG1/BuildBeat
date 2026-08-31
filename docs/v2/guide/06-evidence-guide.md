# Evidence 指南

权威：[`RFC-0002 §4`](../RFC-0002-domain-model.md)；实现：`src/v2/evidence/collector.js`、`src/v2/observe/`。核心：**证据是 Runner 回读到的事实，不是 Worker 的自述**。

## 证据记录的形状

每条证据进事件台账（`EVIDENCE_RECORDED`）并含：`kind`（command/screenshot/drift/runtime-health/diagnosis/…）、`subject`（候选 SHA 或部署单元）、`digest`（原始日志的 sha256，runtime 可删、digest 永续）、`status`、`grade`、producer、起止时间。原始日志落 runtime 面 `.buildbeat/runtime/`；台账与压实记录只引用 digest。

## 状态：三值，fail-closed

| status | 含义 |
|---|---|
| `passed` | 命令零退出、未超时、未被信号杀死 |
| `failed` | 非零退出 / 超时 / 信号 |
| `unverified` | **采不到**：无法启动、数据缺失。永远不是"没问题" |

`unverified` 不会被任何门当作通过（[Policy 指南](03-policy-guide.md) 三值逻辑）。这是 v1 fail-closed 文化的内核化。

## 等级 L0–L4

`L0` 自述 → `L1` 静态检查 → `L2` 本地真实执行（命令回读默认档）→ `L3` 部署后验证 → `L4` 生产实测。门用 `minGrade` 提要求（如 merge 底线 L2；生产切换收口要 L4）。

**验证金字塔警示（三十轮战役最贵一课）**：低层验证追理论完备的边际价值远低于早一层真机。实战中 7400 行 L3 套件打磨到极限，而 4 个真正的上线阻断（systemd 解析行为、部署/服务身份分裂、探针预算按替身标定、TLS ref 格式）**全部是 L3 结构性测不到的**，一晚 L4 找齐。经验法则：**模拟层"真缺陷类清零"即升层，不追理论完备**。同理，verify 全量重跑在候选只动局部时是纯重复——按内容哈希缓存/裁剪属于信封层优化（战役实测 25→13 分钟），内核不代做：缓存正确性依赖环境稳定假设，由信封所有者自己承担。

## 预检 ≠ 证据

`buildbeat-v2 preflight --config <run-config> --step <id>`：在主 checkout 直接干跑某步的 worker 命令——无 worktree、无台账、不落任何证据（输出自带 `PREFLIGHT (dry signal, never evidence)` 横幅，环境变量 `BUILDBEAT_PREFLIGHT=1`）。用途是分钟级循环打到首个失败边界再进 Run（战役里 harness 缺陷每个要烧一整轮 Run，预检模式一晚拆完）；**预检发现的任何东西必须由 Run 复现才算数**。

## 候选作用域

证据以 `subject` 绑定候选：merge 门只统计当前 candidate 的证据，旧候选/旧 review 轮次的记录不混入（真实事故回归，见 evals `fix-loop`）。

## observe：把生产也纳入证据面（v0）

[`RFC-0003 §8`](../RFC-0003-workflow-policy.md) 冻结、M5 实现（`src/v2/observe/`）：

- **Provider**（drift-check / live-status 等项目探针）按同一 Evidence Contract 产出记录，进独立 observe 台账（同一链校验机制，`.buildbeat/runtime/observe/`）；探针挂了=`unverified`（severity 默认 warn），绝不静默；
- **bands 三层**（阈值可配，层级固定）：`log` 只落账 → `diagnose` 触发只读诊断命令、产出 `diagnosis` 证据 → `intent` 把 Intent **草稿**写进 Git 面 `delivery/observe/intents/`（绝不自动执行）；
- **人分诊**：`observe triage --action fix_now|schedule|dismiss`。`fix_now` 之后由人把它带进 software-delivery Run，闭环成立；`dismiss` 回调 bands——同指纹在严重度升级前不再入队（防告警疲劳）；分诊终态写在草稿文件里，删 runtime 不丢（不变量 23）；
- **调度 v0 边界**：`schedule` 字段解析落账但不内置调度器；周期运行=宿主 cron 反复调 `observe run`。

## 完整率

`buildbeat-v2 metrics` 输出证据完整率（有证据的步/应有证据的步）；M4/M5 退出线 ≥95%，试点实测 100%。
