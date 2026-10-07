# 4.0 真实 AI 首跑记录（2026-10-07）

## 做了什么

按[快速开始](../v2/guide/01-quickstart.md)从零接入一个新项目，写、审全部用真实 Codex，连续交付三项工作直到合并。

- 运行时：npm 安装的 `@haiyangbg/buildbeat@4.0.0`，Node 23.6，macOS，Bash 3.2。
- 模板：直接取自全局安装目录 `$(npm root -g)/@haiyangbg/buildbeat/templates/`，未做任何修改。
- worker：随包的 `worker.sh`。builder 与 fixer 用 `codex exec -s workspace-write`，reviewer 用 `codex exec -s read-only`（codex-cli 0.153.0，默认模型，高推理），verifier 跑项目真实测试。
- 项目：`tiny-ledger`，一个按分类汇总 CSV 账目的 Node 命令行工具，起始只有 5 个测试。
- 人的决定（接受、批准）以 `owner` 身份记录，合并由人手工快进。

## 结果

| 工作 | 内容 | 起跑到合并决定 | build / verify / review | review 发现 | Codex token（build / review） |
|---|---|---|---|---|---|
| WORK-MONTH-FILTER | `--month`、`--json`、按分累加、非法月份退出 2 | 3m10s | 2m / 1s / 1m | 0 | 30,076 / 34,698 |
| WORK-QUOTED-CSV | 带引号字段、`""` 转义、字段内换行、BOM、CRLF、错误行号；附项目自有验收测试 | 3m17s | 2m / 1s / 1m | 0 | 33,958 / 33,786 |
| WORK-HTTP-TOTALS | 只读 HTTP 接口：路由、400/404/405/500、`Allow` 头、每次请求重读账本；验收测试要监听端口，只能在 verify 跑 | 3m53s | 2m40s / 1s / 1m | 0 | 40,375 / 40,371 |

- 三项都是 builder 一次写对，verify 一次通过，review 0 发现，每项从起跑到合并决定不到 4 分钟。三项合计约 21.3 万 token。
- review 的 0 发现经人工复核属实：另起临时目录对三个候选做了边界探测（月份校验、按分累加与参数顺序；引号内换行与 CRLF 的行号、引号内空行、BOM；空月份、重复参数、HEAD、多余斜杠、编码路径），都符合工作说明。
- 第三项的 builder 在沙箱里不能监听端口，没跑集成测试，交出的实现在 verify 里一次通过 11 项验收；它还顺手补了分类名为数字时的排序测试。
- 最终项目有 38 个单元测试、11 个验收测试，全部通过。

## 没覆盖到的

- **本项目里 fixer 路径没有触发**：三次都一次通过，没有 verify 失败或阻断 finding。同日另一项真实工作（为 BuildBeat 自身增加跨仓总览，builder 与 fixer 都是 codex）补上了这条路径：三路只读审查第 1 轮 8 P1 + 1 P2，codex fixer 一次修完；第 2 轮 1 P1，再修一次；第 3 轮 0。每轮阻断数都在减少，内核判定收敛、没有停下找人，worker 计时 29 分钟。
- 没有覆盖 `requireScreenshot`、`release` 回读、通知、并行 Run、review 不收敛停人。
- 只验证了 codex exec，其他 CLI 工具未验证。

## 卡点（按影响排序）

四项均已由 WORK-RUNNABLE-HINTS 修复，随 4.1.0 发布。

1. **合并后提示给出必然失败的命令**。合并后 `status` 提示"上线后运行 `buildbeat release --config …`，再 `decide --action close`"。run 配置样板默认不带 `release:` 段，照做直接报错 `release needs a release: section in the run config`，这项工作也就永远停在 MERGED、无法关窗。新项目的第一项工作就会遇到。
2. **样板注释仍是 3.x 命令名**。run 配置样板顶部写着 `buildbeat doctor`、`buildbeat start --config … --attempt new`；4.0 的命令是 `check` 和 `run`（旧名仍可作别名执行）。这段样板被逐字复制进 SKILL.md、快速开始中英版和示例项目。
3. **`check` 输出提到 3.x 的 `inbox`**："a waiting run reaches nobody until someone runs inbox"，4.0 应为 `status`。
4. **快速开始没说模板在哪**。npm 全局安装后，模板在 `$(npm root -g)/@haiyangbg/buildbeat/templates/v2/`，`gitignore.template` 却在上一级 `templates/`；这份 gitignore 模板还带着主仓场景的子仓占位行。

## 顺利的部分

- 接入只需复制四样东西：AGENTS.md / CLAUDE.md、gitignore 排除项、envelope、run 配置。`check` 一屏列全依赖、预算、隔离和并发模式。
- `accept` 绑定 work.md 摘要；`run` 自动编号 `RUN-X-01`；起跑到第一个人工决定点全程无人值守。
- 随包 `worker.sh` 接 Codex 无需任何改动，reviewer 的 JSON 一次解析成功。
- `status` 的 cost 行、步骤耗时与中位数一目了然；`gc` 计划正确保留只在 run 分支上的候选。

## 驾驶者注意

取某个候选的代码做独立检查时，用 `git archive <sha> | tar -x -C <临时目录>`。不要在主检出里执行 `git --work-tree=<临时目录> checkout <sha> -- <路径>`：它会改写主检出的暂存区，之后的快进合并会跳过对应的工作区文件。本次就因此在主检出留下了一个旧版本文件，已发现并恢复，与 BuildBeat 和 Codex 无关。
