# 固定交付流程与配置

[English](02-workflow-guide.en.md)

内置流程：build → verify → review → wait-merge；verify 失败或 review 有 P0/P1 时进入 fix → verify。新配置省略 workflow、riskPreset 和 policies，不再编写自定义流程或规则语言。

- `workers` 配置 builder/verifier/reviewer/fixer 的命令；`allowedPaths` 限定修改范围。缺 worker 时停人接管。
- `reviewTriage: off` 是默认值；确需先裁决再修复的项目可设 required。
- `budgets.reviewRoundsPerWork` 默认 6，跨 Work 全部 Run 累计；可给单步设置 maxAttempts。非只读步骤成功与环境故障不扣失败预算，仍有总尝试兜底。
- 同一问题修后重现（包含换措辞）或阻断数增加即停人；裁决仍按精确指纹。
- `stopAt` 可在固定流程的指定步骤前停人；`maxReviewSeverity: P3` 可提高最终审查要求，默认 P2。
- `parallel: true` 允许不同 Work 同时推进；同一 Work 互斥。端口、数据库等外部资源必须独立。
- `cache: {verify: tree}` 的含义是按代码树、worker 命令和信封摘要复用成功验证；YAML 实际写法见样板，非空行内集合不支持。失败和脏树不复用，依赖外部变化的测试不要启用。
- `requires` 支持命令版本和项目探针；`envelope` 支持角色提示词、变量与 Git pin；`redact` 只脱敏最终证据日志，实时输出可能含原始内容。
- 配置先整体校验，未知键、错误类型和拼写会一次报清。

旧版官方 delivery 文件可以兼容读取，保留原摘要和限制；自定义/上线流程明确拒绝，不自动降级。见 [迁移指南](../../MIGRATION.md)。

测试框架须排除 `.buildbeat/**`，避免收集隔离工作树中的测试。
