# 快速开始（5 分钟）

目标：在一个真实 Git 仓库里，让 v2 Runner 驱动 Build→Verify→Review 自动跑完，**停在合并决定**，由你带着证据拍板。

## 0. 安装

```bash
npm install -g @haiyangbg/buildbeat@next
```

Beta 期 `latest` 仍指向 v1；v2 CLI 是独立入口 `buildbeat-v2`（源码检出等价于 `node src/v2/cli/run.js`）。要求 Node ≥ 20，零运行时依赖。

## 1. 准备工作项（Git 面）

在目标仓库建工作项目录并写下意图与计划（它们的 digest 会绑进批准对象）：

```bash
mkdir -p delivery/work/WORK-DEMO-1
printf "# 意图\n修复 X。\n" > delivery/work/WORK-DEMO-1/intent.md
printf "# 计划\n1. 改 A；2. 测 B。\n" > delivery/work/WORK-DEMO-1/plan.md
```

## 2. 写 run 配置

`delivery/work/WORK-DEMO-1/run-config.yaml`（路径相对本文件解析；YAML 为严格子集，无行内 `{}`/`[]`、无锚点）：

```yaml
repo: ../../..
work: WORK-DEMO-1
run: RUN-DEMO-1
workflow: <buildbeat安装目录>/src/v2/presets/software-delivery.yaml
riskPreset: standard
entry: build
allowedPaths:
  - src
  - tests
workers:
  builder:
    command: codex
    args:
      - exec
      - -s
      - workspace-write
      - 按 delivery/work/WORK-DEMO-1/plan.md 实施，改动后 git commit
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
      - 只读审查本分支相对 base 的改动，把 JSON 信封写入 $BUILDBEAT_OUTPUT
```

Worker 是任意 CLI（codex / claude / 脚本），见 [Adapter 指南](04-adapter-guide.md) 与 [Worker 合同](05-worker-contract.md)。

## 3. 起 Run，停在人批

```bash
buildbeat-v2 start --config delivery/work/WORK-DEMO-1/run-config.yaml
```

Runner 会：开隔离 worktree（分支 `run/RUN-DEMO-1`，push 已被物理封禁）→ builder 产出提交并固定 candidate → verifier 真实跑测试（退出码回读为证据）→ reviewer 只读出结构化 findings → 到达 `WAITING_HUMAN`。`standard` 预设下 build 前还要求 plan 是已接受工件：

```bash
buildbeat-v2 accept --repo . --work WORK-DEMO-1 --artifact plan --by <你的名字>
```

## 4. 看证据、拍板

```bash
buildbeat-v2 inbox --repo .
buildbeat-v2 status --repo . --run RUN-DEMO-1
buildbeat-v2 approve --repo . --run RUN-DEMO-1 --transition enter-wait-merge --by <你的名字> --config delivery/work/WORK-DEMO-1/run-config.yaml
```

批准即 merge-ready；合并/推送/发布永远是你的动作，Runner 不代劳。被 findings 阻断时会自动路由 fix→verify 重走，超预算或指纹重复则停下交还给你（[Approval 指南](07-approval-guide.md)、[Recovery](10-recovery.md)）。

想让 finding 先过你的手再派 fixer：run 配置加 `reviewTriage: required`，配套 `findings list` / `findings adjudicate` 逐指纹裁决（dismiss 后同指纹不再阻断）；正式起 Run 前可用 `preflight --step <id>` 在主 checkout 分钟级干跑单步（不产证据）；信封的环境依赖用 `requires:` 声明，启动前 fail-closed 核验。详见 [Approval 指南](07-approval-guide.md)、[Evidence 指南](06-evidence-guide.md)、[Workflow 指南](02-workflow-guide.md)。

跑起来之后三件事不用再问 AI：`status` 会说每步跑了多久、历史上通常多久、worker 最后一次输出是什么时候（无输出超过 15 分钟标 `STALLED`）；`status` / `inbox` 在每个等待后面直接给出可复制的下一句命令；`.buildbeat/notify.yaml` 配一条钉钉或 webhook 通道，Run 停下来会来找你。同一个 Work 再起新 Run 时旧的等待自动作废，终态 Run 留下的工作树用 `gc --repo .` 清（默认只出计划）。详见 [Approval 指南](07-approval-guide.md) 与 [故障恢复](10-recovery.md)。

「到哪了」问 `buildbeat-v2 overview --repo .`：每个 Work 的阶段与下一步该谁。`start --attempt new` 让一份 run 配置跑到底（自动编号 `RUN-X-01/02…`）；`envelope:` 让内核喂 prompt、`cache: {verify: tree}` 让同树同命令的 verify 不重跑、`requires:` 的 `probe:` 把环境事实前置核验，见 [Workflow 指南](02-workflow-guide.md)。**在 AI 会话里用 BuildBeat 的人不需要记这些命令**：`SKILL.md` §0.5 是给会话读的驾驶手册，用户说「当前进度 / 开工 / 怎么样了 / 批准 / 上线 / 打扫卫生」即可。

## 5. observe：让系统盯生产（v0）

```bash
cp <buildbeat>/src/v2/presets/observe.yaml .buildbeat/observe.yaml   # 改成项目真实探针
buildbeat-v2 observe run --config .buildbeat/observe.yaml            # 一次=一个周期；周期化交给 cron
buildbeat-v2 observe status --repo .
buildbeat-v2 observe triage --repo . --intent delivery/observe/intents/INTENT-<fp>.md --action fix_now --by <你>
```

探针失败/采不到 → 证据 `failed`/`unverified` → bands 分层（记录→只读诊断→Intent 草稿入队）。草稿**绝不自动执行**；`dismiss` 会回调阈值，同指纹在严重度升级前不再打扰。详见 [Evidence 指南](06-evidence-guide.md) §observe。
