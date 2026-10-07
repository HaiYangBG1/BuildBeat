# Quickstart

Install the runtime: `npm install --global @haiyangbg/buildbeat@latest` (Node ≥ 20). Before upgrading from 3.x, finish or cancel runs still in progress with their original 3.x runtime, see [Migration](../../MIGRATION.md); never replace a runtime underneath an active run.

1. Check Node ≥20, Git, Bash and an authenticated AI tool. Keep project-owned instructions.
2. The templates ship with the npm package under `$(npm root -g)/@haiyangbg/buildbeat/templates/`. Install `v2/AGENTS.md` and `v2/CLAUDE.md` according to the tool's loading rules; copy runtime exclusions from `gitignore.template` (in `templates/`, not in `v2/`).
3. Create delivery/work/WORK-X/work.md using the goal, scope, acceptance and implementation sections in work.example.md.
4. Copy templates/v2/envelope/ to delivery/envelope/ and configure real tool and verification commands. New work needs no workflow.yaml copy.
5. After the user accepts the work, use the commands below. Detach long runs from short host timeouts and handle the decision shown by status.

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat check --config delivery/work/WORK-X/run-config.yaml
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

```yaml
# BuildBeat v2 run 配置样板。拷到 delivery/work/<WORK-ID>/run-config.yaml 后改 work / run / allowedPaths / workers。
# 路径相对本文件解析。严格 YAML 子集：只有块列表与块映射（列表项可与键同缩进），行内只允许空的 [] / {}，无锚点，注释必须独占一行。
# 起跑前：buildbeat check --config <本文件>；起跑：buildbeat run --config <本文件>
repo: ../../..
work: WORK-X
# 家族名；run 自动编成 RUN-X-01/02…，--new 开新一轮
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

[Migration](../../MIGRATION.md) · [Worker contract](05-worker-contract.en.md) · [Recovery](10-recovery.en.md)

Before starting, commit work.md and worker scripts into the selected base so the isolated checkout sees the accepted scope. Acceptance records may be committed afterward.

For a main repository with code repositories, use `buildbeat status --repo . --all-repos` for pending decisions and open work across repositories; add `--work <ID>` or `--json` as needed. See [Session handoff](11-session-handoff.en.md).
