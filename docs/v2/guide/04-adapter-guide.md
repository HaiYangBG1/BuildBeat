# Worker 接入

[English](04-adapter-guide.en.md)

Shell Adapter 执行配置的 AI CLI 或脚本；运行目录是隔离工作树。模型、鉴权和业务能力由所用工具提供。已有真实 AI worker 证据覆盖 codex exec；其他工具需要独立验证。

输入：BUILDBEAT_INPUT 包含工作、步骤、候选上下文；BUILDBEAT_PROMPT 指向本轮提示词。输出：结构化步骤写 BUILDBEAT_OUTPUT；verifier 的退出码和日志由内核读取。随包 worker.sh 负责参数、提交和信封传递。

默认环境变量仅 PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL；env 可指定注入，inheritEnv 明确放开继承。HOME 下的文件不在环境变量隔离范围内。

超时、崩溃、无效 JSON 或 exit 75 表示环境故障，停人且不派 fixer。普通非零退出按候选失败处理。实时 stdout/stderr 供 status 读取，结束后转为证据日志。

Mock Adapter 只用于确定性回归，不能证明真实模型的业务能力。
