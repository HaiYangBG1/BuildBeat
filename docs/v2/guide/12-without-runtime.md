# 不装运行时也能参与

[English](12-without-runtime.en.md)

没有 `buildbeat` 运行时的人或 AI 工具（没有 Node 的机器、网页版 AI 对话、受限的公司电脑）仍可以通过项目文件参与。它们没有自动闭环、隔离工作树、批准校验、预算和恢复，也不得声称拥有这些能力。

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

- **关闭不需要上线的 Work**（例如只改文档）：写好 `result.md` 后追加 `{"ts":"2026-10-04T09:00:00.000Z","decision":"closed","transition":"close-work","subject":{"result":"<结论>","resultDigest":"sha256:<64 位十六进制>","promotions":[]},"by":"<姓名>","actor":{"kind":"human","id":"<姓名>","source":"flag"}}`。`resultDigest` 是 `result.md` 文件内容的 SHA-256（例如 `shasum -a 256 result.md`）；`promotions` 按 result.md 的写回行逐条填 `{"path":"<路径>","commit":"<完整提交号>"}`，没有写回就是 `[]`。需要上线的 Work 用运行时的 `release` 与 `decide --action close` 关窗，关窗会绑定回读记录。

- **写关系行**：在起草中的 `work.md`（接受前）或 `result.md` 里一行一个写 `- follows: <编号>`、`- split from: <编号>`、`- related: <编号>`、`- ref: <外部编号>`。它们是纯文本，装有运行时的一方用 `status --work` 会把相连的工作串成一条线。

- **为某项工作提交代码或文档时**，提交信息末尾空一行写 `Work: <ID>`。装有运行时的一方用 `buildbeat history --path` 就能从代码找回这项工作。

`actor` 如实写是谁做的决定：人写 `"kind":"human"`；AI 工具自己做的决定写 `"kind":"agent"`，`id` 写工具名；AI 工具转达人在对话里说的决定，写人的名字和 `"kind":"human"`，再加 `"via":"agent-session"`。只有 `by`、没有 `actor` 的旧行照常有效，status 显示为"身份未记录"。

每行必须是完整的一行 JSON，只追加不改旧行。写完后提交（commit），交给装有运行时的一方。`delivery/` 要进 Git，不要在 `.gitignore` 或 `.git/info/exclude` 里排除它。

## 不得做

- 批准或拒绝 Run、采纳候选：这些决定由运行时写入 Run 台账，并在盖章前重新回读候选与证据。
- 写或改 Run 台账、`run-record.json`、`releases.jsonl` 或任何证据；声称验证、审查、上线回读或写回核对已经通过。
- 以别人的名义写决定；修改已有行。

## 交给装有运行时的一方

对方拉取提交后运行 `buildbeat status --repo . --work <ID>`：新改的 `work.md` 显示为待接受，手写的接受行与裁决行按同样的摘要与指纹规则生效；`result.md` 的写回行会被现场核对（✓/✗），关窗后 `result.md` 又改过也会标出。之后 `buildbeat run --config <config>` 继续交付。
