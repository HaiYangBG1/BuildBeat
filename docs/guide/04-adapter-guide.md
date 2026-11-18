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

## 只有一个 AI 工具，或者先不配审查

审查要的是另开一个没参与写代码的只读会话，不是另一家的产品。你正在用的那个工具，无头运行一次就是一个新会话，就能当审查者。

**先不配审查也行。** 配置里不写 `workers.reviewer`，`buildbeat review` 只跑验证，过了照常停下等人决定，批准照常能做。这一轮记的是只验证的流程（`verify-only`）；送审输出、`status`、批准结果和 `history --path` 都标着"verified, not reviewed"，不会被说成审过了。这项工作之前的审查提出过、还没人裁决的 P0、P1，仍然拦着批准，要人驳回，不会因为去掉审查者就放过。以后想审，补上 `workers.reviewer` 就行。

**给任意工具配审查命令：**

1. 找到它的命令行。有的工具把命令行装在桌面应用里，不在 PATH 上（比如 WorkBuddy 在 `/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`），配置里写完整路径就行。命令行要单独登录的，先在终端里登录一次。
2. 看它的 `--help`，找两样：无头运行（通常叫 `-p`、`--print`、`exec`），只读或只放行查看类命令的开关。`worker.sh` 把提示词作为最后一个参数交给它，所以它要能从最后一个参数读提示词。
3. 写进 `workers.reviewer`，只改 `--` 后面的部分，再跑 `buildbeat check --repo .`：工具找不到会报出来。
4. 送审一次，看是不是交回了报告。没交报告、报告读不懂、动了文件，这一轮都是 `CANCELLED`，不会被当成审过。

几种常见写法，参数以各工具当时的 `--help` 为准：

| 工具 | `--` 后面写什么 | 实测 |
|---|---|---|
| Codex | `codex exec -s read-only` | 本仓一直在用 |
| Claude Code | `claude -p --tools Read,Grep,Glob,Bash --allowedTools Read Grep Glob "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(printenv:*)" --permission-mode dontAsk` | 没实测 |
| WorkBuddy | 它自带的 `codebuddy`（完整路径见上），参数同 Claude Code 一行 | 没实测 |
| Cursor | `cursor-agent -p --mode ask` | 没实测 |
| Gemini CLI | `gemini --approval-mode plan -p` | 没实测 |

YAML 里每个参数写一行，例如 Claude Code 那一行写成：

```yaml
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - claude
      - -p
      - --tools
      - Read,Grep,Glob,Bash
      - --allowedTools
      - Read
      - Grep
      - Glob
      - Bash(git diff:*)
      - Bash(git log:*)
      - Bash(git show:*)
      - Bash(printenv:*)
      - --permission-mode
      - dontAsk
```

**用同一个工具审，弱在哪：** 新上下文、只读、真实验证命令这三样都有；但写和审是同一个模型，盲点更可能重合。有两个工具时，仍然推荐换一个来审。工具自己没有只读开关时，运行时只兜得住"改了文件"（这一轮作废），兜不住它读本机别的文件。

**工具没有命令行无头模式**（只有编辑器里的聊天窗口）：先不配审查、只跑验证；或者用[只用 Skill 和项目文件](12-without-runtime.md)的方式。两种都不能说做过独立审查。
