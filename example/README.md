# example/ —— 可直接拷的示例：虚构项目「简账」跑完一个 Work 的快照

> 这是一个**单仓、无 UI、一个 Builder 端到端**的最小项目，展示 `templates/` 填好项目事实之后长什么样，以及一个 Work 从立项、接受、Run、合并决定到合并之后，仓库里留下哪些文件。项目、人物、决策全部虚构。

## 里面是什么

| 路径 | 是什么 | 来源 |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` / `指挥台.md` / `BUILDBEAT.md` | 会话装载入口、一行指针、给人看的操作卡、运行时版本标记 | `templates/v2/` 填好项目名、边界、视角路由 |
| `gitignore.template` | 拷入后改名 `.gitignore`（npm 包不带点文件，所以这里不带点） | `templates/gitignore.template` |
| `pm/decisions.md` | 平台级拍板台账：接入时的【BOOTSTRAP】决策包和本 Work 的【EXPORT-1】决策包各一行 | `templates/pm/decisions.md` |
| `.buildbeat/notify.yaml` / `observe.yaml` | 通知通道（URL 只走环境变量）与只读体检配置的样例 | 按 [Approval 指南](../docs/v2/guide/07-approval-guide.md) / [Evidence 指南](../docs/v2/guide/06-evidence-guide.md) |
| `delivery/envelope/` | worker 包装脚本 + builder / reviewer / fixer 三份 prompt，末尾补了本项目的环境事实 | `templates/v2/envelope/` |
| `delivery/work/WORK-EXPORT-DATE-FILTER/` | 一个完整的 Work：`intent.md`（为什么 + 止损线）、`plan.md`、`run-config.yaml`、`workflow.yaml`（官方预设的逐字副本）、`decisions.jsonl`、`runs/RUN-EXPORT-01/run-record.json` | 前四份人写；后两份是运行时产出（见下） |
| `src/` / `tests/` / `package.json` | 应用本体：`ledger.js` 是"老地盘"（只维护），`export.js` 是本 Work 加了日期筛选之后的样子，`npm test` 是 verify 步跑的真实命令 | 虚构 |

## 快照的时点与哪些是机器写的

快照 = **所有者批准合并决定并合并候选之后**的仓库。`decisions.jsonl` 里的三条（接受 intent、接受 plan、合并决定）和 `runs/RUN-EXPORT-01/run-record.json` 不是手写的：它们是把本目录放进一个一次性 Git 仓库、用脚本 worker 代替 `codex exec` 真跑一遍 `accept → doctor → start → approve` 得到的原始输出，只在拷出时去掉了本机路径（运行时本来就不输出绝对路径）。因此 run-record 里的 `candidate` / `base` 两个 commit 指向那个一次性仓库，在你拷出的仓库里查不到——真项目里它们必须可以 `git cat-file -t` 查到。review 的那条 P2 finding 也是脚本 worker 按 reviewer 合同返回的样例。

`tests/example-firstrun.test.js` 锁住两件事：这些工件彼此一致（plan 的 digest 与批准对象一致、无绝对路径），以及把本目录原样拷进一个新仓库后，用脚本 worker 能再起一个 Run（`RUN-EXPORT-02`）跑到合并决定，verify 步跑的是本项目真实的 `npm test`。它不证明某个真实模型能完成任务。

## 怎么用它起自己的项目

不要整目录照抄——项目名、边界、视角、验证命令都是简账的。按 [SKILL.md](../SKILL.md) §8 的"自查 → 少量提问 → 一屏确认 → 生成"走，让会话从 `templates/` 生成；本目录只用来对照"填好之后应该长什么样"。想手动核对命令，按 [快速开始](../docs/v2/guide/01-quickstart.md)：把 `run-config.yaml` 里 `--` 后面的 `codex exec …` 换成你实际用的工具，`accept` 之后 `doctor`，再 `start --attempt new`。
