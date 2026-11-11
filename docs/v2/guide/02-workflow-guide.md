# 一轮审查与配置

[English](02-workflow-guide.en.md)

代码由会话写、会话提交。运行时只做一件事：`buildbeat review --repo . --work <ID> [--commit <sha>]` 把这个提交送去验证和审查。

一轮是固定的三步，不能配置：

1. 在这个提交的临时检出里跑项目的验证命令。
2. 验证通过后，请只读的审查者看这项工作从起点到这个提交的改动。
3. 删掉检出，停下等人的决定。

运行时不写代码、不重试、不修复。收场有三种：

- `FAILED`：验证没过，提交改了 `allowedPaths` 之外的目录，或验证后检出不干净、HEAD 被挪动。这是提交的问题，修好再送。
- `CANCELLED`：超时、崩溃、exit 75、审查者没交报告或报告读不懂、审查者动了文件。这是工具的问题，不是对提交的判定，环境好了再送。
- 等人决定：验证过了、审完了。还有没裁决的 P0、P1 时批准会被拒。

修在新提交里再送审；同一项工作还在等决定的旧一轮自动记为 `SUPERSEDED`。审查进程被杀掉的那一轮，由下一次送审记为 `CANCELLED`。一个仓库同一时间只跑一轮审查。

## 配置

项目一份 `delivery/run-config.yaml`，样板是 `templates/v2/run-config.example.yaml`：

- `workers.verifier`、`workers.reviewer`：两条命令（`command`、`args`，可写 `timeoutMs`、`env`、`inheritEnv`）。
- `envelope`：审查提示词所在目录和变量。
- `requires`：开跑前要有的命令和最低版本，缺了直接报清楚。
- `redact`：证据日志落盘前脱敏用的正则。
- `requireScreenshot: true`：有界面的项目，见[证据](06-evidence-guide.md)。
- `maxReviewSeverity`：默认 `P2`，即 P0、P1 拦批准；写 `P3` 则 P2 也拦。
- `release`：上线回读命令，见[决定与证据](07-approval-guide.md)。

单项工作要和项目不一样时，在 `delivery/work/<ID>/run-config.yaml` 里只写要覆盖的键。那里还能写：

- `allowedPaths`：这项工作能改哪些目录。工作自己的文件夹总是允许。
- `base`：这项工作从哪个提交算起。不写就是最后一次改它 work.md 的那个提交，所以 work.md 要先于代码提交。

写了不认识的键、类型不对、拼错，`buildbeat check --repo . [--work <ID>]` 和 `review` 都会一次报清，并指出是哪份文件。

运行编号是 `RUN-<工作编号去掉 WORK->-<两位序号>`，每送审一次加一。

测试框架要排除 `.buildbeat/**`，免得收集到临时检出里的测试。
