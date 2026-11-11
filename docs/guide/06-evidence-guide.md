# 证据

[English](06-evidence-guide.en.md)

证据来自 Git 和真实执行：种类、提交、日志摘要、结果、产生者和起止时间。通过、失败、没验证分开记；一个提交的证据不能给另一个提交放行。

验证命令的证据等级记为 L2。等级不证明生产可用；线上是否正常看[上线回读](07-approval-guide.md)。

## 截图

有界面的项目在配置里写 `requireScreenshot: true`。验证运行时，`BUILDBEAT_SCREENSHOT_DIR` 指向检出外一个新的空目录；验证命令把真渲染的截图以 PNG 写进去，每张记为绑定这个提交的证据（文件摘要）。

只接受可解码的 PNG 普通文件：检查块的排列和校验和、尺寸位深和调色板、影响解码的附加块，并把像素数据解压核对一遍（单张上限 256 MiB）。空文件、截断的文件、符号链接和 jpg、webp 等其他格式会被拒并写明原因，即使同一次验证另有截图通过也照样记下。批准时按同一规则重新核对文件。

这证明图片能解码，不证明画面正确；画面由审查者和决定的人判断。验证通过却没有截图，这一轮记为失败。

## 存在哪

原始日志在 `.buildbeat/runtime/`，不进 Git。每一轮结束后的记录（`runs/<RUN>/run-record.json`）、决定（`decisions.jsonl`）和审查问题与裁决（`review-findings.jsonl`）在 `delivery/work/<ID>/`，跟代码一起进 Git。记录里是摘要，不是原始日志的备份，要留原始日志按项目自己的要求留。

`status --work <ID>` 的成本行是 `cost: review rounds <n> · findings <m>`：这项工作审了几轮、提过几条问题。它是从记录里数出来的，不是 Token 或金额账单。
