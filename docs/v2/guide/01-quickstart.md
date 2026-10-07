# 快速开始

安装运行时：`npm install --global @haiyangbg/buildbeat@latest`（Node ≥ 20）。从 3.x 升级前，先用原来的 3.x 运行时完成或取消仍在进行的 Run，见[迁移说明](../../MIGRATION.md)；不要在 Run 进行中替换运行时。

1. 检查 Node ≥20、Git、Bash 和已鉴权的 AI 工具；保留项目自己的规范。
2. 将 templates/v2/AGENTS.md、CLAUDE.md 按工具装载方式放入项目；复制 gitignore.template 的运行时排除项。
3. 建 delivery/work/WORK-X/work.md，使用 work.example.md 的目标、范围、验收、实施计划结构。
4. 把 templates/v2/envelope/ 复制为 delivery/envelope/；配置真实工具和验证命令。新工作不用复制 workflow.yaml。
5. 用户接受工作说明后运行下面命令。长运行使用宿主支持的脱离方式启动；根据 status 的待决定对象处理例外。

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat check --config delivery/work/WORK-X/run-config.yaml
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

```yaml
# BuildBeat v2 run 配置样板。拷到 delivery/work/<WORK-ID>/run-config.yaml 后改 work / run / allowedPaths / workers。
# 路径相对本文件解析。严格 YAML 子集：只有块列表与块映射（列表项可与键同缩进），行内只允许空的 [] / {}，无锚点，注释必须独占一行。
# 起跑前：buildbeat doctor --config <本文件>；起跑：buildbeat start --config <本文件> --attempt new
repo: ../../..
work: WORK-X
# 家族名；--attempt new 自动编成 RUN-X-01/02…
run: RUN-X
# builder / fixer 只能改这些目录；越界改动不成为候选
allowedPaths:
  - src
  - tests
# off = P0/P1 finding 直接派 fixer；高风险项目改成 required，每轮先停人分诊再派 fixer
reviewTriage: off
# 非只读步成功不扣次数；review 按轮计费。review 不收敛（修过的 finding 又出现，或阻断数多于上一轮）才在 enter-fix 停人。
# reviewRoundsPerWork 是 review 轮数唯一的上限（默认 6），跨本 Work 所有 Run 累计，对应 intent 的止损线；
# 到顶的阻断 review 在 enter-fix 一次批准修复、重验、再审。总 attempt 超过（配置值 + 人批扩额）的 3 倍前仍兜底停人。
budgets:
  reviewRoundsPerWork: 6
# 默认一个仓库同时只驱动一个 Run。确认本项目的测试不抢固定端口、不共用数据库后，
# 可加 parallel: true，让本 Work 的 Run 与其他同样打开开关的 Work 并行（同一 Work 仍互斥）
# 同树 + 同命令 + 同信封已通过就复用 verify 证据
cache:
  verify: tree
# 内核把 prompts/<worker>.md 喂给 worker（$BUILDBEAT_PROMPT）；模板见 templates/v2/envelope/prompts/
envelope:
  prompts: ../../envelope/prompts
  vars:
    component: app
# worker 输出落成证据前按这些 JS 正则脱敏（不支持 (?i) 这类内联标志）
redact:
  - "(token|secret|password|TOKEN|SECRET|PASSWORD)=\\S+"
# worker 以隔离 worktree 为 cwd 运行；delivery/envelope/worker.sh 已随仓库进 worktree。
# 换工具只改 `--` 后面的命令：codex exec … / claude -p … / 任意脚本。
workers:
  builder:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - builder
      - --
      - codex
      - exec
      - -s
      - workspace-write
  # 真实测试命令；环境不满足就 exit 75（内核当基础设施故障停人）
  verifier:
    command: bash
    args:
      - -lc
      - npm test
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
  # 不能省：没配它，verify 失败 / review 阻断时 Run 停人等手修
  fixer:
    command: bash
    args:
      - delivery/envelope/worker.sh
      - fixer
      - --
      - codex
      - exec
      - -s
      - workspace-write
```

[Migration](../../MIGRATION.md) · [Worker contract](05-worker-contract.md) · [Recovery](10-recovery.md)

启动前将 work.md 和 worker 脚本提交到所选 base，确保隔离工作树能读到同一份已确认范围；接受记录可以随后提交。

主仓管理多个代码仓时，用 `buildbeat status --repo . --all-repos` 查看跨仓待批与未了结工作；可加 `--work <ID>` 或 `--json`。详见[跨会话接续](11-session-handoff.md)。
