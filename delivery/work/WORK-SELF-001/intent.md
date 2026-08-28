# Intent：Self-host 试点标记（WORK-SELF-001）

## 为什么做

M4 要求 Self-host 试点：BuildBeat v2 用自己的 Runner 在自己的仓库上完成一次
真实 Run（build → verify → 只读 review → 停在合并决定），以发现运行时在真实
仓库（有 remote、有历史、有完整测试面）上的问题。

## 目标

- 在本仓库产生一个由 Runner 驱动、证据全部回读的 Run；
- Run 自动到达 `WAITING_HUMAN`（合并决定），留在 inbox 待项目所有者决定。

## 非目标

- 不 merge、不 push、不发布（授权边界沿用 `V2-D2=A`）；
- 不修改 `delivery/work/WORK-SELF-001/` 之外的任何路径（allowedPaths 强制）。

## 验收条件

- builder 在允许范围内提交一个真实 candidate；
- verify 运行本仓库真实测试并通过（退出码回读）；
- 只读 review 产出结构化 findings；
- 最终状态 `WAITING_HUMAN`（final-decision），metrics 可读出本 Run。
