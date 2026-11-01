# 只用文件的团队也拿到截图忽略规则；关窗示例带编号

## 目标

指南 12「只用 Skill 和项目文件」有两处和运行时对不上：

1. 配置项目那段话只让 AI 拷工作说明和结果页两个样板，没让它把 `delivery/` 下截图、压缩包、日志的忽略规则加进 `.gitignore`；可后面又写着「其中的截图、压缩包和日志不进 Git，模板里已写好忽略规则」。只用文件的团队拿不到这些规则。
2. 关窗示例行没有 `decisionRef`，`status` 把它显示成「-」；运行时自己写的关窗行是 `C-<ID>-<当前行数+1>`。

做完后，配置那段话多一步：把 `templates/gitignore.template` 里 `delivery/` 的忽略规则加进项目的 `.gitignore`。关窗示例带上 `decisionRef`，写法和接受行一样。中英两版同步。

## 起因

2026-11-01 所有者让会话把待办全部做完（「全部做完，需要我拍板的时候找我」），其中一项是 10-25 留下的「空仓按新指南走一遍」。会话在空仓里只照指南 12 手写文件：

- 接受、提交带 `Work:` 标记、写回 AGENTS.md、写 result.md、关窗都写成了。运行时读回：工作为 CLOSED，接受没过期，写回 ✓，`history --path` 能经标记找回工作。
- 发现上面两处。

- follows: WORK-DELIVERY-BINARIES
- related: WORK-TEAM-ENTRY

## 已核实的现状（2026-11-01，main `0277d27`）

**文档里的说法**

- `docs/v2/guide/12-without-runtime.md:20-30` 是配置项目那段话。第 2 步只拷 `work.example.md` 和 `result.example.md`；第 4 步只要求确认 `delivery/` 没被排除。英文版同样在 `docs/v2/guide/12-without-runtime.en.md:20-30`。
- `docs/v2/guide/12-without-runtime.md:88` 写着「其中的截图、压缩包和日志不进 Git，模板里已写好忽略规则」。英文版同一行。
- `docs/v2/guide/12-without-runtime.md:64` 规定接受行的 `decisionRef` 用 `A-<ID>-<当前行数+1>`。`docs/v2/guide/12-without-runtime.md:78` 的关窗示例没有 `decisionRef`。

**代码已确认**

- `templates/gitignore.template:22-32` 是 `delivery/` 下截图、压缩包、日志的忽略规则，前面有两行说明。
- 运行时写的关窗行编号是 `C-<ID>-<当前行数+1>`，例如 `delivery/work/WORK-SCOPE-RENAMES/decisions.jsonl` 的第 5 行 `C-WORK-SCOPE-RENAMES-5`。
- `tests/check_docs.py:835-862`（`check_without_runtime_guide`）要求中英两版的记录示例形状一致。

## 范围

包含：

- 指南 12 中英两版：配置那段话加一步；关窗示例加 `decisionRef`，并在说明里写明编号规则。
- CHANGELOG `## Unreleased`。

不包含：

- 快速开始和 README：它们走装运行时的路，已经让人复制 `gitignore.template`。
- 运行时代码：手写的关窗行没有 `decisionRef` 也照常有效。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 忽略规则怎么给 | 配置那段话加一步：只把 `templates/gitignore.template` 里 `delivery/` 那段（说明和 9 条规则）加进项目的 `.gitignore`，没有就新建 | 让 AI 拷整份模板：里面还有 `.buildbeat/` 和代码子仓的占位行，不装运行时的项目用不上，还得手删 |
| 2 | 关窗示例的编号 | 加 `"decisionRef":"C-<ID>-<当前行数+1>"`，规则和接受行一样 | 不加：手写的关窗在 `status` 里显示成「-」，和运行时写的对不上 |

**对外名字（接受即确认）**

- 配置那段话新增的一步（中文原文）：「把那个仓库里 templates/gitignore.template 中 delivery/ 那一段（截图、压缩包、日志的忽略规则和上面的说明）加进这个项目的 .gitignore（没有就新建）。」英文：「Add the delivery/ block of templates/gitignore.template in that repository (the ignore rules for screenshots, archives and logs, with the comment above them) to this project's .gitignore, creating it if missing.」放在原第 2 步之后，后面各步顺延。
- 关窗示例在 `"decision":"closed"` 前加 `"decisionRef":"C-<ID>-<当前行数+1>"`；说明加一句「`decisionRef` 和接受行一样，用 `C-<ID>-<当前行数+1>`」，英文「`decisionRef` follows the same rule as the acceptance line: `C-<ID>-<current line count + 1>`」。

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查（含中英记录示例形状一致）、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`（起点 `0277d27`）。
- 驾驶会话在空仓里照新的配置那段话和示例重走一遍：`delivery/work/W/a.png` 被忽略、`delivery/work/W/work.md` 不被忽略；手写关窗行后，`status --work` 显示 `C-<ID>-<n>`，不再是「-」。结果写进 notes.md。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 无。

## 实施计划

1. 指南 12 中英两版改配置那段话和关窗示例。
2. CHANGELOG。
3. 空仓重走一遍。

驾驶会话亲自写，提交带 `Work: WORK-GUIDE12-SETUP`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。

## 停止条件

- 运行时读手写的、带 `decisionRef` 的关窗行出错：先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
