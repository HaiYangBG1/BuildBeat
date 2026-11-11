# 快速开始

安装运行时：`npm install --global @haiyangbg/buildbeat@latest`（Node ≥ 20）。从 6 以前的版本升级：先用旧版把在跑的工作跑完或取消；旧版本留下的记录不用动，已关窗的照常显示，没关的旧格式工作显示 `LEGACY`。

1. 检查 Node ≥20、Git、Bash 和已鉴权的 AI 工具；保留项目自己的规范。
2. 模板随 npm 包安装在 `$(npm root -g)/@haiyangbg/buildbeat/templates/`。将其中 `AGENTS.md`、`CLAUDE.md` 按工具装载方式放入项目；从 `gitignore.template`（同在 `templates/` 下）复制运行时排除项。`delivery/` 要跟代码一起进 Git，不要在 `.gitignore` 或 `.git/info/exclude` 里排除它；其中的截图、压缩包和日志不进 Git，模板里已写好忽略规则。
3. 把 `run-config.example.yaml` 复制为 `delivery/run-config.yaml`，把 `envelope/` 复制为 `delivery/envelope/`，把验证命令和审查命令换成真实的，提交。这份配置说的是这个项目里一个提交怎么验、怎么审，所有工作共用。`buildbeat check --repo .` 检查它写对了没有。
4. 建 delivery/work/WORK-X/work.md，照 `work.example.md` 的八节写：目标、起因、已核实的现状（标题写核实时的提交号，每条带出处，引用代码写成 `路径:起-止`）、范围、开工前待拍板、验收、实施计划、停止条件。标题可以用项目自己的语言。提交它：这个提交之后的改动才算这项工作的。
5. 用户接受工作说明后，会话写代码、自己提交，再送审。送审在这个提交的临时检出里跑验证，请只读的审查者看一遍，然后停在人的决定。批准写的是完整提交号。合并后（声明了上线的，回读通过后），照 `result.example.md` 写 delivery/work/WORK-X/result.md，再用最后一条命令关窗。

```bash
buildbeat accept --repo . --work WORK-X --as human --by owner
buildbeat check --repo . --work WORK-X
buildbeat review --repo . --work WORK-X
buildbeat status --repo . --work WORK-X
buildbeat decide --repo . --work WORK-X --action approve --candidate <完整 SHA> --as human --by owner
buildbeat decide --repo . --work WORK-X --action close --as human --by owner
```

项目配置最少写这两项：

```yaml
workers:
  # 真实测试命令；环境不满足就 exit 75（记为工具故障，不算这个提交的问题）
  verifier:
    command: bash
    args:
      - -lc
      - npm test
  # 只读审查。换工具只改 `--` 后面的命令
  reviewer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - reviewer
      - --
      - codex
      - exec
      - -s
      - read-only
envelope:
  prompts: envelope/prompts
```

样板里还有 `requires`（开跑前检查环境）、`redact`（证据脱敏）、`requireScreenshot`（有界面的项目）、`release`（上线回读命令）和 `maxReviewSeverity`。单项工作要和项目不一样时，在 `delivery/work/WORK-X/run-config.yaml` 里只写要覆盖的键；那里还能写 `allowedPaths`（这项工作能改哪些目录）和 `base`（从哪个提交算起）。写了不认识的键会直接报错。

一轮审查有三种收场：`FAILED` 是验证没过或改了范围外的目录，修好再送；`CANCELLED` 是工具出了问题，不是对提交的判定，环境好了再送；等人决定时，还有没裁决的 P0、P1 就不能批准。修在新提交里再送审，旧的那一轮自动作废。

[Worker contract](05-worker-contract.md) · [Recovery](10-recovery.md)

主仓管理多个代码仓时，用 `buildbeat status --repo . --all-repos` 查看跨仓待批与未了结工作；可加 `--work <ID>` 或 `--json`。详见[跨会话接续](11-session-handoff.md)。
