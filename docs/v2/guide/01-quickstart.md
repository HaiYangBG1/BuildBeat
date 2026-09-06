# 快速开始：第一个 Run

目标：在一个真实 Git 仓库里，让 v2 Runner 驱动 Build→Verify→Review 自动跑完，**停在合并决定**，由你带着证据拍板。下面的顺序是固定的：安装 → 准备工作项 → 写 run 配置 → 接受计划 → doctor → start → 看证据、拍板。每一步都写了"成功是什么样"。耗时取决于你的 worker 与任务，本文不给承诺数字。

> 在 AI 会话里用 BuildBeat 的人不需要手敲这些命令：`SKILL.md` §0.5 是给会话读的驾驶手册，你说「开工 / 当前进度 / 批准」即可。本文给的是会话背后跑的东西，方便你核对。

## 0. 安装

```bash
npm install --global @haiyangbg/buildbeat@latest
buildbeat-v2 | head -3    # 打印 "BuildBeat v2 runtime" 与用法即安装成功
```

2.0.0 起 `@latest` 就是 v2；同一个包同时给出 `buildbeat`（v1 生命周期命令：doctor / init / adopt / upgrade）和 `buildbeat-v2`（本文用的运行时）。预发布才用 `@next`。要求 Node ≥ 20、Git、bash，零运行时依赖。

## 1. 准备工作项（Git 面）

在目标仓库建工作项目录并写下意图与计划（它们的 digest 会绑进批准对象），把官方 workflow 预设复制到工作项旁边（复制而不是引用安装目录：workflow 文件的 digest 会记进 Run，随项目一起进 Git）：

```bash
mkdir -p delivery/work/WORK-DEMO-1
printf "# 意图\n给 CSV 导出加日期筛选。\n止损线：最多 3 个 Run、4 轮 review。\n" > delivery/work/WORK-DEMO-1/intent.md
printf "# 计划\n1. 在 src/export.js 加 from/to 参数；2. tests/ 补边界用例。\n" > delivery/work/WORK-DEMO-1/plan.md
cp "$(npm root -g)/@haiyangbg/buildbeat/src/v2/presets/software-delivery.yaml" delivery/work/WORK-DEMO-1/workflow.yaml
```

## 2. 写 run 配置

`delivery/work/WORK-DEMO-1/run-config.yaml`。路径相对**本文件**解析；YAML 是严格子集：只有块列表与块映射，没有行内 `[]` / `{}`、没有锚点。下面这份可以原样解析。

```yaml
repo: ../../..
work: WORK-DEMO-1
run: RUN-DEMO
workflow: workflow.yaml
riskPreset: standard
entry: build
allowedPaths:
  - src
  - tests
reviewTriage: required
workers:
  builder:
    command: codex
    args:
      - exec
      - -s
      - workspace-write
      - 按 delivery/work/WORK-DEMO-1/plan.md 实施；改动后 git add 并 git commit
  verifier:
    command: bash
    args:
      - -lc
      - npm test
  reviewer:
    command: codex
    args:
      - exec
      - -s
      - read-only
      - 只读审查本分支相对 base 的改动。只输出一个 JSON 对象并写入 $BUILDBEAT_OUTPUT 指向的文件：{"status":"succeeded","findings":[{"severity":"P1","summary":"..."}]}；severity 只能是 P0/P1/P2/P3，每条必须有 summary；没有问题就 findings 为空数组
  fixer:
    command: codex
    args:
      - exec
      - -s
      - workspace-write
      - 读环境变量 BUILDBEAT_INPUT（JSON）里的失败命令、退出码、日志摘要和 findings，只修这些问题；改动后 git add 并 git commit
```

- `workers.<角色>` 是任意 CLI（codex / claude / 脚本），见 [Adapter 指南](04-adapter-guide.md)；reviewer 的输出格式见 [Worker 合同](05-worker-contract.md)。
- **`fixer` 不是可选项**：没配它，verify 失败或 review 阻断时 Run 会停 `WAITING_HUMAN`（理由 `no adapter configured for worker fixer`）等你手修，不会自动修。
- worker 子进程默认只拿到 `PATH HOME LANG LC_ALL TMPDIR TERM USER SHELL`；需要别的变量用 `env:` 点名注入（[Adapter 指南](04-adapter-guide.md)）。
- `reviewTriage: required` 让 P0/P1 finding 先过你的手再派 fixer；不想要就删掉这行。

## 3. 接受计划

`standard` 预设在 build 前要求 plan 是已接受工件（`controlled` 还要求 intent）。接受是 digest 绑定的：接受后改了 plan，接受自动过期，`doctor` 会报 `stale`。

```bash
buildbeat-v2 accept --repo . --work WORK-DEMO-1 --artifact plan --by <你的名字>
```

成功：打印 `accepted plan as A-WORK-DEMO-1-<n>` 与 `digest: sha256:…`。

## 4. doctor：起跑前把 start 会读的事实读一遍

```bash
buildbeat-v2 doctor --config delivery/work/WORK-DEMO-1/run-config.yaml
```

逐段核对：`policies` 每条的 declared 与 actual 强制等级；`worker isolation` 每个 worker 是 `env allowlist` 还是 `WARNING inherit`；`push protection`；每步预算；`work artifacts` 里 intent / plan 是否存在、是否已接受、是否 stale，以及"start 会停在哪一步"的预告。有 `WARNING` 不代表不能跑，但要知道它意味着什么；退出码 0 不等于全部就绪。

## 5. 起 Run，停在人批

```bash
buildbeat-v2 start --config delivery/work/WORK-DEMO-1/run-config.yaml --attempt new
```

`--attempt new` 自动编号 `RUN-DEMO-01/02…`，并作废同一 Work 下仍在等人的旧 Run。Runner 会：开隔离 worktree（分支 `run/RUN-DEMO-01`，对配置 remote 的 push 已被封禁）→ builder 产出提交并固定 candidate → verifier 真实跑测试（退出码回读为证据）→ reviewer 只读出结构化 findings → 到达 `WAITING_HUMAN`。

从 AI 会话里启动时要脱离启动（`nohup` / `setsid`），否则宿主会话超时会把 Run 杀掉。

**成功是什么样**：输出末尾 `status: WAITING_HUMAN`，`waiting on human:` 后面是 `enter-wait-merge`（合并决定）或 `enter-fix`（分诊）。**停在 `infra` 是环境问题不是代码问题**：超时、崩溃、非 JSON 信封、退出码 75 都算，修好 worker / 环境后 `approve --transition resume-<step>` 续跑，预算不扣。

## 6. 看证据、拍板

```bash
buildbeat-v2 overview --repo .                       # 每个 Work 走到哪、下一步该谁、花了多少
buildbeat-v2 inbox --repo .                          # 等你批的 Run，每条附可复制的下一句命令
buildbeat-v2 status --repo . --run RUN-DEMO-01       # 步、耗时、证据、findings、待批理由
```

批之前先看：候选 SHA、verify 的退出码与日志、review 的每条 finding。然后按 `inbox` 给出的那一句执行，通常是：

```bash
buildbeat-v2 approve --repo . --run RUN-DEMO-01 --transition enter-wait-merge --by <你的名字> --config delivery/work/WORK-DEMO-1/run-config.yaml
```

**批的是哪一步要分清**（[Approval 指南](07-approval-guide.md)）：`enter-wait-merge` 是合并决定，Run 进终态 `SUCCEEDED`，表示候选具备合并条件——真正的合并、push、发布永远是你在 Runner 之外的动作；`enter-fix` / `resume-<step>` 是非终态转换，批准后要 `resume --config …` 让它续跑。被 findings 阻断时会自动路由 fix→verify→review 重走，超预算或失败指纹重复则停下交还给你（[Recovery](10-recovery.md)）。

## 7. 走一次失败分支

想看自动修复闭环，把一条会失败的用例提交进 `tests/`，再 `start --attempt new`：verify 失败 → fixer 带着失败摘要修 → verify 重跑 → review。`status` 会显示 `step fix: SUCCEEDED` 与第二次 `verify`。想让 finding 先过你的手：`reviewTriage: required` 配套 `findings list` / `findings adjudicate` 逐指纹裁决，dismiss 后同指纹不再阻断。

## 8. 恢复、通知、打扫

- 进程被杀 / 机器重启：`resume --config <run-config.yaml>`，见 [故障恢复](10-recovery.md)。
- 自己在 worktree 里把问题修好并提交了：`resume --config … --adopt <sha> --by <名字>` 跳过 fixer 从 verify 续跑。
- 不想一直盯着：`.buildbeat/notify.yaml` 配一条钉钉 / webhook 通道（URL 只能来自环境变量），Run 停下会来找你（[Approval 指南](07-approval-guide.md)）。
- 终态 Run 留下的工作树：`gc --repo .` 先出计划，`--apply true` 再清。
- 正式起 Run 前想干跑单步：`preflight --step <id>`（主 checkout、分钟级、不产证据）；信封的环境依赖用 `requires:` 声明，启动前 fail-closed 核验（[Workflow 指南](02-workflow-guide.md)）。

## 9. observe：让系统盯生产（v0）

```bash
cp "$(npm root -g)/@haiyangbg/buildbeat/src/v2/presets/observe.yaml" .buildbeat/observe.yaml   # 改成项目真实探针
buildbeat-v2 observe run --config .buildbeat/observe.yaml            # 一次=一个周期；周期化交给 cron
buildbeat-v2 observe status --repo .
buildbeat-v2 observe triage --repo . --intent delivery/observe/intents/INTENT-<fp>.md --action fix_now --by <你>
```

探针失败/采不到 → 证据 `failed`/`unverified` → bands 分层（记录→只读诊断→Intent 草稿入队）。草稿**绝不自动执行**；`dismiss` 会回调阈值，同指纹在严重度升级前不再打扰。详见 [Evidence 指南](06-evidence-guide.md) §observe。
