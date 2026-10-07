# 工作确认与决策

[English](07-approval-guide.en.md)

新工作只有一份 work.md。accept 绑定文件当前摘要，不会自动开工；用户授权继续后 run 推进。旧 intent/plan/spec 接受记录兼容读取。

status 的决定卡包含 transition、候选、计划摘要、证据、原因和下一步。decide --action approve|reject 必须指向该 Run 与转换。批准前重新回读候选与冻结校验；变化、脏树、缺证据或不合格审查不能盖章。非终态批准后用 run 续跑，最终批准只表示具备合并条件。

审查问题通过 decide --action accept|dismiss --work ... --fingerprint ... 裁决。精确指纹的驳回持续生效；换说法的相似性只用于停止不收敛循环，不代替人的裁决。

正常修复自动继续；重复问题、阻断数增加、环境故障或预算耗尽才形成例外决定。预算批准一次放行对应修复、重验和再审；扩额记录可以重放，驾驶会话不能自行冒充用户批准。

合并和上线仍由人完成。上线后运行 `buildbeat release --config <config> [--note <text>]`：它确认该 Work 已成功 Run 的候选包含在 `--ref`（默认当前 HEAD）中，在主检出执行 run-config `release:` 段配置的只读回读命令（形状、环境白名单与脱敏同 worker），把结果、退出码、提交、输出摘要和末尾若干行追加到 `delivery/work/<ID>/releases.jsonl`。最近一次回读通过后，用 `decide --repo . --work <ID> --action close --result <text>` 关窗，写入绑定该回读的 close-work 决定；回读失败时不能关窗。run 配置都没有 `release:` 段的 Work 到合并为止，status 提示没有剩余必做步骤。

通知只报告待批、结束或疑似卡顿，不能接收审批；webhook/钉钉 URL 仅从环境变量读取，发送失败不影响 Run。看门进程是运行反馈的内部实现。
