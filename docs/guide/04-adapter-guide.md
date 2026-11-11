# 接入验证命令和审查工具

[English](04-adapter-guide.en.md)

验证者和审查者都是配置里的一条命令，在这个提交的临时检出里运行。模型、鉴权和能力由你用的工具提供。随包的 `templates/envelope/worker.sh` 把提示词作为最后一个参数交给审查工具，并把它的输出交回；换工具只改 `--` 后面的命令。

运行时交给命令的：

- `BUILDBEAT_INPUT`：JSON，含工作编号、步骤、工作说明的路径和摘要（`workArtifact`）、起点提交（`base`）、上次审查过的提交和历史裁决。
- `BUILDBEAT_PROMPT`：本轮提示词文件（只给审查者）。
- `BUILDBEAT_OUTPUT`：审查者把报告写到这里。
- `BUILDBEAT_SCREENSHOT_DIR`：验证命令写截图的目录（配置了截图时）。

验证者只看退出码和日志：0 是通过，75 是环境没准备好，其他非零是这个提交没过。

环境变量默认只带 `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`；`env` 列出要额外带进去的，`inheritEnv: true` 全部继承。`check` 会打印每条命令实际拿到的环境。HOME 下的文件不在这层隔离之内。

超时、崩溃、报告读不懂、exit 75 都记为工具故障，这一轮 `CANCELLED`。

哪些工具真的跑通过，要各自验证；脚本化的审查者只能证明流程接得上，不能证明真实模型的能力。
