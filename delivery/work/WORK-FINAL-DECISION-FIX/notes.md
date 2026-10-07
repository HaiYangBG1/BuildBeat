# Fixer 修复记录

本轮依据 `BUILDBEAT_INPUT` 中 6 条 `open` findings 修复；范围以 work.md 和 run-config.yaml 的 allowedPaths 为准。

- `39875445a26cd8a0`：CLI 透传 `--candidate`，合并决定卡、待批列表与通知填入候选 SHA；修复后未绑定或旧候选批准仍拒绝。
- `3f1c1f85f1c1fd34`：两条修复入口均以 `candidate ?? base` 作为当前候选，保留 requestFix 的待批对象校验；覆盖 verify 起步和 build 无提交。
- `b0166d2c69253d0c`：中英审批、恢复指南说明刷新卡片并执行带候选的批准命令。
- `3f35919796c55a10`：Skill 与中英指南明确要求包含本变更的运行时，排除已发布 4.0 / 4.1.0，尚未指定支持版本；加入文档检查。
- `d20f09004826bfd3`：CLI 回归实际执行显示的命令，覆盖新 Run 与既有 4.x Run 的两条修复路径；确认旧命令拒绝、新命令成功以及台账绑定新 SHA。
- `4ea2c717d93e0303`：fixture、runtime、CLI 子进程及 shell worker 隔离 Git 配置，fixture 仓禁用签名与 hooks；恶意配置回归确认两项子测试实际运行且 hooks 未执行。

此前 builder 记录的候选参数接线缺口已按本轮明确的修复指令补齐。

## 本轮验证

- `node --test tests/v2-final-decision-fix.test.js tests/v2-adopt.test.js tests/v2-approval.test.js tests/v2-cli-flags.test.js tests/v2-runnable-hints.test.js`：40/40 通过。
- `node --test --test-name-pattern='nextReply' tests/v2-notify.test.js`：2/2 通过；范围为通知中的回复命令，不涉及 HTTP 通知发送。
- `npm run check:docs` 与 `git diff --check`：通过。
- 本轮未运行完整 verify.sh 或独立 review，以上为 fixer 相关测试结果，不代替正式验收。
- 未修改 allowedPaths 之外的文件；未对本 Run 执行 commit 或 push。

未修条目：无；本轮输入没有 dismissed 条目。
