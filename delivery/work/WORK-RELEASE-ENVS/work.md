# 各环境线上是哪个版本，status 一条命令答得出；上线手册在项目里有固定去处

## 目标

"预发和生产现在是哪个版本""换镜像前要先摘流量""测试要 Node 24"，这类事在项目里没有地方查，只好记在某个人本机的记忆里。5.3 版规定会变的事实不抄进项目文件、只写去哪查，可"线上是哪个版本"偏偏没地方查；不常变的操作规矩和坑，也没有默认的写回去处。

做完后：

1. `buildbeat release --config <cfg> --env <name>` 把环境名记进回读记录，并通过环境变量 `BUILDBEAT_RELEASE_ENV` 告诉回读命令，一份配置就能管所有环境。分几步上线的（比如三台机器逐台换），每一步各跑一次回读，用 `--note` 写是哪一步，不必每步复制一份配置。
2. `buildbeat status --repo <path> --releases` 汇总所有工作的回读记录：每个环境最近一次通过的回读是哪项工作、哪个提交、什么时候、哪一步；之后又有失败的回读，就在同一行标出来。加 `--all-repos` 汇总主仓和代码仓，加 `--json` 输出机器可读的结果。
3. 没跑过 Run 的工作也能记回读：没有成功的 Run 时，回读绑定到这项工作在发布分支上最新的代码提交（用 WORK-COMMITTED-WORKS 的"提交 → 工作"函数）。只为记回读的配置可以只写 `repo`、`work` 和 `release:`，不用写 `workers:`。这样配了回读、没跑过 Run 的工作，不会再既记不了回读、又关不了窗。
4. 新模板 `templates/v2/operations.example.md`（项目操作手册：怎么上线、怎么回滚、环境要求、踩过的坑），在 `result.md` 模板"写回项目"一节里写明：项目没有现成的地方时，这类结论默认写进 `docs/operations.md`。手册只写规矩和坑；"现在线上是哪个版本"用 `status --releases` 查，不写进手册。

## 起因

2026-11-05 所有者转来一个业务试点项目的使用反馈（12 条），会话核实后建议先做第 1、2、3 条，所有者说「按推荐起草」。这是第 3 条，反馈原话：「"预发和生产现在是哪个版本""换镜像前要先摘流量""测试要 Node 24"，这些都记在我本机的记忆里。5.3 版规定会变的事实不写进 `result.md`、只写去哪查，但这几样东西在项目里本来就没有地方可查。」它建议「加 `buildbeat status --releases`……模板里加一份项目级的"操作手册和坑"文档，作为 `result.md` 写回结论的默认去处」。

第 5 条（"运维工作"类型：计划→演练→批准→执行→回读）只取最轻的一部分放在这里：每个环境、每一步一条回读记录，一份配置管所有环境。BuildBeat 自己执行上线，和 4.0 定下的"BuildBeat 不做部署、上线由人和项目工具做"冲突，不做。

- related: WORK-COMMITTED-WORKS
- related: WORK-LIVE-FACTS
- related: WORK-FOLDER-EXTRAS

## 已核实的现状（2026-11-05，main `1be6ff7`）

**代码已确认**

- 回读记录一行的字段在 `src/v2/runtime/release.js:165-181`：时间、工作、Run、候选、ref、提交、主检出、备注、命令、退出码、通过与否、摘要、日志位置、最后 20 行输出。没有环境。
- 回读要求有成功的 Run，候选还要在发布的 ref 里，否则报错（`src/v2/runtime/release.js:102-118`）。
- 关窗：工作有 `release:` 设置或已有回读时，要求最近一次回读通过（`src/v2/runtime/release.js:225-246`）。
- 配置检查要求一定有 `workers:`（`src/v2/cli/run-config-check.js:218`）；`release` 命令走同一个加载函数（`src/v2/cli/run.js:350`、`:1661-1698`）。
- 实测（临时仓库）：一项没跑过 Run 的工作，配置里只写 `release:` 时 `release` 报 `workers: required and missing`；关窗报 `has no readback`。补上 `workers:` 也没用，`release` 会报 `has no succeeded run`。也就是配了回读、没跑 Run 的工作既记不了回读，也关不了窗。
- 回读命令的环境变量走 `workerEnvOverrides`（`src/v2/cli/run.js:328-345`、`:557-560`）。
- status 没有跨工作的回读汇总；单项工作只显示自己最近一次回读（`src/v2/runtime/overview.js:336`、`:431-437`）。
- `templates/v2/result.example.md` "Written into the project" 一节列了该写回的几类结论，没有给默认去处；`templates/v2/AGENTS.md` 末段只说不要抄会变的事实。

**试点仓库（只读，远端开发分支，2026-11-04 的提交）**

- 10 月 14 日以后 440 个提交里有 207 个是上线、导数据、改配置这类运维提交（反馈里的数，会话没有逐个复核）。
- 143 项工作下面有按环境和步骤分的子文件夹（`preprod-p1/`、`prod-p1/` 这类），里面共 3785 个文件；19 项工作有 57 份 `release*.yaml`，按环境和步骤各复制一份；只有 19 项工作有 `releases.jsonl`。
- 项目已经有自己的 `deploy/` 目录。
- 127 项没跑过 Run 的工作（见 WORK-COMMITTED-WORKS）都没有配置文件，现在一条回读也记不了。

**待确认**

- 回读命令里读 `BUILDBEAT_RELEASE_ENV` 是否需要改环境变量白名单（`src/v2/runtime/env-contract.js`）：在 Run 里用测试确认。

## 范围

包含：

- `src/v2/runtime/release.js`：`env` 字段；没有成功 Run 时绑定到工作的最新代码提交。
- `src/v2/cli/run.js`、`src/v2/cli/run-config-check.js`：`--env`；只为记回读的配置；`status --releases`。
- 汇总逻辑放进 `src/v2/runtime/`（新文件或 `overview.js` 旁）。
- 模板：`templates/v2/operations.example.md`（新）、`templates/v2/result.example.md`、`templates/v2/AGENTS.md`、`templates/v2/run-config.example.yaml` 的 `release:` 注释。
- 文档：Skill 会话操作表的"上线后回读、关窗"一行、快速开始或审批指南里讲 `release` 的地方、指南 12（只用文件）里模板清单，中英文；CHANGELOG `## Unreleased`。
- 回归测试。

不包含：

- BuildBeat 执行上线、换镜像、摘流量：仍由人和项目工具做（4.0 的决定）。
- "运维工作"类型、计划/演练/批准的流程：不做。
- 把试点已有的 `preprod-p1/` 这类子文件夹或 `release-*.yaml` 迁成新写法：由试点所有者决定。
- 手写回读记录的格式（只用文件的团队）：指南 12 仍然规定不得手写 `releases.jsonl`，不变。
- 示例项目 `example/`：不加操作手册。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 多环境怎么配 | 一份配置一个 `release:`，`--env` 通过 `BUILDBEAT_RELEASE_ENV` 传给回读命令，由项目脚本自己按环境查 | 配置里按环境写多个回读命令（`release: { prod: …, preprod: … }`）：配置格式变复杂，YAML 子集也要多支持一层 |
| 2 | 分步上线 | 每一步各跑一次回读，`--note` 写第几步 | 加 `--step`：多一个参数，汇总时要定"最后一步"怎么算 |
| 3 | `status --releases` 显示什么 | 每个环境一行：最近一次通过的回读；如果之后又有失败的回读，同一行标出；没写 `--env` 的老记录归到 `-` 一行 | 列出全部回读：试点一个环境一天就有好几条，答不了"现在是哪个版本" |
| 4 | 没跑 Run 的工作绑定到哪个提交 | 这项工作追到的、在发布 ref 里的最新代码提交；一个都没有就拒绝 | 直接绑定发布 ref 的提交：任何工作都能对任何版本记回读，"这次上线包含这项工作"就没有依据了 |
| 5 | 只记回读的配置 | 有 `release:`、没有 `workers:` 的配置，`release`、`check`、`status` 都接受；`run` 拒绝并说明 | 还要求写 `workers:`：没跑 Run 的工作要写一份用不上的 worker 配置 |
| 6 | 操作手册放哪 | 模板 `templates/v2/operations.example.md`，建议拷成项目的 `docs/operations.md`；`result.md` 模板写明这是默认去处，项目已有自己的手册就写进自己的 | 放进 `AGENTS.md`：AGENTS.md 每次都整篇进会话上下文，坑越记越长 |

**对外名字（接受即确认）**

- 用法行：`buildbeat release --config <run-config.yaml> [--env <name>] [--ref <ref>] [--note <text>]`、`buildbeat status --repo <path> --releases [--all-repos] [--json]`
- 环境变量：`BUILDBEAT_RELEASE_ENV`（没给 `--env` 时不设）
- 回读记录新字段：`env`（没给时不写这个字段）
- 回读结果一行在现有输出里加环境：`readback passed (exit 0) for <ref> at <sha7> in <env>, …`
- 没跑 Run 的工作回读成功后：`… candidate <sha7> (no run: latest commit of <ID> in <ref>)`
- 没跑 Run、又追不到提交时拒绝：`<ID> has no succeeded run and no commits in <ref> trace to it; nothing to read back`
- `run` 遇到只记回读的配置：`<config> has no workers: it only records releases (buildbeat release); add workers to run it`
- `status --releases` 文本（环境按名字排序，`-` 排最后）：

  ```
  releases (latest passing readback per environment):
    <env>  <ID>  <sha7> @ <ts>[ — <note>][ · later readback failed @ <ts> (<ID>, exit <code>)]
    -      <ID>  <sha7> @ <ts>   (recorded without --env)
  ```

  一条都没有时：`releases: none recorded (buildbeat release --config <run-config.yaml> --env <name>)`
- `--json`：`{ "releases": [ { "env", "work", "repo", "commit", "candidate", "run", "at", "note", "laterFailure": null | { "work", "at", "exitCode" } } ] }`
- 操作手册模板标题和开头：`# Operations` / `How to release, roll back and run this project, and the traps that have bitten before. Rules and steps only: what is deployed right now comes from buildbeat status --releases, not from this page.`
- `result.example.md` 补的一句：`If the project has no place for an operating rule or a trap, write it into docs/operations.md (template: templates/v2/operations.example.md).`

## 验收

机器检查：

- `verify.sh` 全部通过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑，以及本工作范围内的 `git diff --check`（起点 `1be6ff7`）。
- 新增测试（照 `tests/v2-screenshot-release.test.js` 的写法起临时仓库）：
  - `--env prod --note "step 2"`：记录里有 `env` 和 `note`，回读命令读到 `BUILDBEAT_RELEASE_ENV=prod`；不给 `--env` 时记录没有 `env` 字段、环境变量不设。
  - 两项工作、两个环境、各几次回读（含一次后来的失败）：`status --releases` 文本和 `--json` 和上面的格式逐字一致；`--all-repos` 把代码仓的记录也汇总进来。
  - 没跑 Run、只写了 `release:` 的配置：`release` 成功，候选是这项工作在 ref 里最新的代码提交，`run` 为 `null`；随后写好 `result.md` 能关窗。追不到提交时拒绝。`run --config` 用这份配置拒绝并给出上面的提示。
  - 有 Run 的工作：回读、关窗的行为和现在一样。
  - 新测试在现在的代码上失败（驾驶会话交 Run 前确认，写进 notes.md）。
- 已有测试的断言一条不改照样通过；没有回读记录的仓库，`status` 输出不变。
- 文档检查通过；新模板随 npm 包发出（`tests/v2-package-files.test.js`）。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 试点要不要改用 `--env` 记回读、要不要建 `docs/operations.md`，由试点所有者决定，这里不改试点仓库。

## 实施计划

1. `release.js`：`env` 字段和环境变量；没有成功 Run 时用 WORK-COMMITTED-WORKS 的共用函数找这项工作在 ref 里的最新代码提交。
2. `run-config-check.js` / `run.js`：只记回读的配置；`--env`；`run` 的拒绝提示。
3. 汇总：读每项工作的 `releases.jsonl`，按环境取最近一次通过的，再看之后有没有失败；接进 `status --releases` 和 `--all-repos`。
4. 模板和文档、CHANGELOG、测试。

驾驶会话亲自写代码，提交带 `Work: WORK-RELEASE-ENVS`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。等 WORK-COMMITTED-WORKS 合入会话分支后再开 Run（第 1 步要用它的共用函数）；和 WORK-COMMIT-TRAILERS 都改 `run.js` 和 CHANGELOG，两项依次开 Run，不同时跑。

## 停止条件

- 已有测试的断言要改：先停下来问。
- 环境变量白名单、YAML 子集或配置格式要改得比上面说的多：先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
