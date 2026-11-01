# 提示里给的命令都能直接执行：结果

范围与对外文字见 [work.md](work.md)。驾驶会话写实现并以 `--adopt` 交接，verify 跑本地全量检查，review 是随包 4.0 reviewer 提示词的只读 codex。RUN-RUNNABLE-HINTS-01 以 SUCCEEDED 结束，候选 `194abbe` 已快进合入 `v2`。

## 交付

- 已合并、run 配置都读到且都没有 `release:` 段的工作，下一步改为"没有剩余必做步骤"；有 `release:` 段时提示指向带该段的配置；读不了配置时保留原提示。
- 待人决定却取不到回复命令时，兜底提示 `status --work`；`check` 的通知说明改为 `status`。
- run 配置样板注释及其副本（Skill、快速开始中英、示例项目）改用 `check` / `run` / `--new`；快速开始写明 npm 包里模板的位置；审批指南说明没有 `release:` 段的工作到合并为止；文档检查拦截旧注释再次出现。
- WORK-CROSS-REPO-STATUS 的两项遗留：`--all-repos` 输出改为英文；单仓 `status` 对有工作目录、无工作说明但有运行的工作恢复 `NO_INTENT`。

## 验证

- `verify.sh` 一次通过：Node 回归 323 项、文档检查、Bash 信封、Claude 插件、安装后首跑、Work 范围 `git diff --check`。
- 新增 8 项回归中，7 项在改动前的代码上失败；另 1 项是"读不了配置时保留原提示"的边界保护，改动前后都应通过。
- review 一轮 0 发现（审查日志执行约 44 条检查命令）。
- 人工对照 4.0.0：5 个代码仓零差异；本仓 13 项、另一代码仓 4 项已合并且无 `release:` 的工作改为"没有剩余必做步骤"；一条待批命令里的 `<run-config.yaml>` 占位换成真实路径（来自 WORK-CROSS-REPO-STATUS）。
