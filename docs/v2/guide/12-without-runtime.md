# 只用 Skill 和项目文件

[English](12-without-runtime.en.md)

一个人或一个团队，只用 BuildBeat 的 Skill 和项目里的文件，就能把每项需求的上下文留在 Git 里：为什么做、查实了什么、定了什么、做成了什么、写进了项目哪些文档。这些全是纯文本，AI 编程工具照着写就行，不需要 Node，也不需要 `buildbeat` 运行时。没有 Node 的机器、受限的公司电脑、网页版 AI 对话都能用；把 BuildBeat 推荐给同事时，也从这里起步。

## 能得到什么，运行时又多给什么

| | 只用 Skill 和项目文件 | 再装上运行时 |
|---|---|---|
| 需求的上下文 | `work.md`、决定、`result.md`、关系行、带指针的现状、提交里的 `Work:` 标记，都跟代码一起在 Git 里 | 同左；另外由运行时核对：接受是否已过期、写回的提交在不在主干上、现状所指的代码变没变、一行代码来自哪项工作 |
| 做事 | AI 工具按平常的方式改代码、跑测试，合并走项目原来的流程 | 在隔离工作树里自动实现、验证、审查、修复，带证据停在人的合并决定 |
| 看进度 | 读 `delivery/work/` 下的文件 | `buildbeat status` 汇总所有工作和待决定的事 |

只用文件时，没有自动闭环、隔离工作树、批准校验、预算和中断恢复，AI 不得声称有这些。自己跑的测试照实说是自己跑的。

## 怎么开始

把下面这段复制给你的 AI 编程工具（Claude Code、Codex、Cursor 都行），它会把项目配好。项目是大家共用的，不管谁用什么工具，都照这一段配。

```text
请帮我在这个项目里用 BuildBeat 的写法记录需求，先不装运行时（https://github.com/HaiYangBG1/BuildBeat）：

1. 读那个仓库里的 SKILL.md 和 docs/v2/guide/12-without-runtime.md，之后按"只用 Skill 和项目文件"的方式干活。
2. 把那个仓库里的 templates/v2/work.example.md 和 templates/v2/result.example.md 拷到这个项目的 delivery/templates/ 下。
3. 在这个项目的 AGENTS.md（没有就新建）里加一句：需求按 BuildBeat 的写法记在 delivery/work/<编号>/，模板在 delivery/templates/，规则见 https://github.com/HaiYangBG1/BuildBeat/blob/main/docs/v2/guide/12-without-runtime.md
4. 确认 delivery/ 没有被 .gitignore 或 .git/info/exclude 排除，然后把这些改动提交。
5. 弄好后用一两句话告诉我可以开始了。之后我只用平常的话说要做什么。
```

用 Claude Code 的，还可以装上插件，以后每个会话都会自动加载 Skill；插件里也带着模板和这份指南，不用装 npm 包。

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
```

## 日常怎么做

1. **起草**：说清要做什么，AI 照 `delivery/templates/work.example.md` 的八节在 `delivery/work/<编号>/work.md` 起草；"已核实的现状"的标题写核实时的提交号，引用代码写成 `路径:起-止`。
2. **接受**：你看过、同意后，AI 照下面"接受 `work.md`"的格式在 `decisions.jsonl` 末尾记一行，摘要由它算。
3. **动手**：照平常的方式改代码、跑测试、提交，提交信息末尾带 `Work: <编号>`；合并走项目原来的流程。
4. **收口**：合并后照 `delivery/templates/result.example.md` 写 `result.md`。以后还用得上的结论，先写进项目自己的文档并提交，再在 `result.md` 里记成 `路径 @ 提交`；AI 可以用 Git 自查这个提交在主干上、确实改了那个文件。
5. **关窗**：照下面的格式记一行关窗，把 `result.md` 和 `decisions.jsonl` 一起提交。

换会话或换人接手时，先读 `work.md`、`decisions.jsonl` 和 `result.md`；现状里的指针用 `git diff <标题里的提交> HEAD -- <路径>` 看代码变没变。

## 可以读

| 文件（`delivery/work/<ID>/` 下） | 内容 |
|---|---|
| `work.md` | 目标、起因、已核实的现状、范围、开工前待拍板、验收、实施计划、停止条件 |
| `decisions.jsonl` | 接受、批准、关窗等决定，一行一个 JSON |
| `review-findings.jsonl` | 审查发现与人的裁决 |
| `runs/<RUN>/run-record.json` | 已结束 Run 的终态、候选、证据摘要与成本 |
| `releases.jsonl` | 合并后的上线回读记录 |
| `result.md` | 关窗时写：做成了什么、定了什么、剩下什么、写进了项目哪些文档 |

正在进行的 Run 台账在运行它的机器的 `.buildbeat/runtime/` 中，不进 Git；进度以那一方的 `buildbeat status` 为准。

## 可以写

- **起草或修改 `work.md`**。修改会让已有接受失效，运行时会显示为待接受或已过期。
- **由工作所有者接受 `work.md`**：在 `decisions.jsonl` 末尾追加一行，`digest` 是 `work.md` 文件内容的 SHA-256（例如 `shasum -a 256 work.md`），`decisionRef` 用 `A-<ID>-<当前行数+1>`：

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","decisionRef":"A-WORK-X-1","decision":"approved","transition":"accept-work","subject":{"artifact":"work","digest":"sha256:<64 位十六进制>"},"by":"<姓名>","actor":{"kind":"human","id":"<姓名>","source":"flag"}}
  ```

- **裁决已记录的审查发现**：在 `review-findings.jsonl` 末尾追加一行，`fingerprint` 必须是已有发现的指纹，`action` 为 `accept` 或 `dismiss`：

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","kind":"adjudication","fingerprint":"<指纹>","action":"dismiss","by":"<姓名>","actor":{"kind":"human","id":"<姓名>","source":"flag"},"note":"<理由>"}
  ```

- **写 `result.md`**：照 `templates/v2/result.example.md` 写。以后还用得上的结论先写进项目自己的文档并提交（提交要已经在主干上），再在 result.md 里每条写成 `- <路径> @ <提交> — <写了什么>`。

- **关窗**（凡是没有设上线回读的 Work 都这样关，不管上没上线，比如只改文档的，或者团队没装运行时的）：写好 `result.md` 后追加 `{"ts":"2026-10-04T09:00:00.000Z","decision":"closed","transition":"close-work","subject":{"result":"<结论>","resultDigest":"sha256:<64 位十六进制>","promotions":[]},"by":"<姓名>","actor":{"kind":"human","id":"<姓名>","source":"flag"}}`。`resultDigest` 是 `result.md` 文件内容的 SHA-256（例如 `shasum -a 256 result.md`）；`promotions` 按 result.md 的写回行逐条填 `{"path":"<路径>","commit":"<完整提交号>"}`，没有写回就是 `[]`。run 配置里设了上线回读（`release:`）的 Work，用运行时的 `release` 与 `decide --action close` 关窗，关窗会绑定回读记录。

- **写关系行**：在起草中的 `work.md`（接受前）或 `result.md` 里一行一个写 `- follows: <编号>`、`- split from: <编号>`、`- related: <编号>`、`- ref: <外部编号>`。它们是纯文本，装有运行时的一方用 `status --work` 会把相连的工作串成一条线。

- **写已核实的现状**：标题写核实时的提交号，引用代码写成反引号里的 `路径:起-止`。这也是纯文本；没有运行时时，用 `git diff <那个提交> HEAD -- <路径>` 自己看代码变了没有。装有运行时的一方用 `status --work` 会列出变了的地方。

- **为某项工作提交代码或文档时**，提交信息末尾空一行写 `Work: <ID>`。装有运行时的一方用 `buildbeat history --path` 就能从代码找回这项工作。

`actor` 如实写是谁做的决定：人写 `"kind":"human"`；AI 工具自己做的决定写 `"kind":"agent"`，`id` 写工具名；AI 工具转达人在对话里说的决定，写人的名字和 `"kind":"human"`，再加 `"via":"agent-session"`。只有 `by`、没有 `actor` 的旧行照常有效，status 显示为"身份未记录"。

每行必须是完整的一行 JSON，只追加不改旧行。写完后提交（commit）。`delivery/` 要进 Git，不要在 `.gitignore` 或 `.git/info/exclude` 里排除它；其中的截图、压缩包和日志不进 Git，模板里已写好忽略规则。

## 不得做

- 批准或拒绝 Run、采纳候选：这些决定由运行时写入 Run 台账，并在盖章前重新回读候选与证据。
- 写或改 Run 台账、`run-record.json`、`releases.jsonl` 或任何证据；声称运行时的验证、审查、上线回读或写回核对已经通过。
- 以别人的名义写决定；修改已有行。

## 以后加上运行时

想让 AI 在隔离工作树里自动实现、验证、审查、修复，想让机器替你核对上面这些记录，或者工作多了要一眼看全进度，就按[快速开始](01-quickstart.md)装上运行时。已经写下的文件不用改：

运行 `buildbeat status --repo . --work <ID>`：新改的 `work.md` 显示为待接受，手写的接受行与裁决行按同样的摘要与指纹规则生效；`result.md` 的写回行会被现场核对（✓/✗），关窗后 `result.md` 又改过也会标出。之后 `buildbeat run --config <config>` 接着交付。同一个项目里，装了运行时的人和没装的人用的是同一批文件。
