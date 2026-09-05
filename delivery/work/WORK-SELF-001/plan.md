# Plan：Self-host 试点标记（WORK-SELF-001）

## 修改范围

仅 `delivery/work/WORK-SELF-001/`（allowedPaths 强制；越界即停）。

## 实现顺序

1. builder：写入 `selfhost-marker.md`（记录 run 元信息）并提交为 candidate；
2. verify：`node --test tests/v2-event-ledger.test.js tests/v2-reducer.test.js`（真实测试，退出码回读）；
3. review：fresh-context 只读审查，输出结构化 findings 信封。

## 风险

- 试点脚本 Worker 不具备语义判断（本 Run 验证的是 Runner 与协议，不是 Agent 智能）；
- 仓库有 remote（origin）：workspace 推送保护必须生效。

## 测试方法

verify 步运行仓库真实测试子集；merge 门证据地板（standard preset）在批准时强制。

## 回滚方式

Run 分支不合并即无影响；worktree 与 runtime 可整体删除（不变量 23）。
