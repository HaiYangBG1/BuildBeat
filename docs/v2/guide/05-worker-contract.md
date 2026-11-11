# 审查者和验证者的合同

[English](05-worker-contract.en.md)

验证者跑项目真实的验收命令。它不改文件、不挪动 HEAD；验证后检出不干净或 HEAD 变了，这一轮记为 `FAILED`。

审查者独立、只读，看的是固定的一个提交。它动了检出里的文件，这一轮记为 `CANCELLED`，报告作废。

审查报告写进 `$BUILDBEAT_OUTPUT`：`{"status":"succeeded","findings":[{"severity": "P1", "summary": "具体问题"}]}`。severity 是 P0–P3，summary 是字符串；`P0` / `P1` 阻断批准。没有问题也要交 `{"findings": []}`。报告外面包一层 json 代码块可以接受。

读不懂的报告、缺 severity 的问题、退出 0 却没写报告（只打印在 stdout 不算），都记为 `invalid-output`，属于工具故障，不能据此要求改代码。

审查者的输入里有工作说明（`workArtifact`：仓内路径和已接受的摘要）、起点提交、上次审查过的提交和历史裁决。提示词可以用它们；审查者不能自行批准。

环境缺工具、后端不可用、沙箱禁止必要操作，用 exit 75；不要通过改代码掩盖环境问题。日志不要输出凭据。提交、退出码和证据都由运行时自己回读，自述不能替代事实。
