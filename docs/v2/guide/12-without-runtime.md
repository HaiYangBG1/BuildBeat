# 不装运行时也能参与

[English](12-without-runtime.en.md)

没有 `buildbeat` 运行时的人或 AI 工具（没有 Node 的机器、网页版 AI 对话、受限的公司电脑）仍可以通过项目文件参与。它们没有自动闭环、隔离工作树、批准校验、预算和恢复，也不得声称拥有这些能力。

## 可以读

| 文件（`delivery/work/<ID>/` 下） | 内容 |
|---|---|
| `work.md` | 目标、范围、验收、实施计划 |
| `decisions.jsonl` | 接受、批准、关窗等决定，一行一个 JSON |
| `review-findings.jsonl` | 审查发现与人的裁决 |
| `runs/<RUN>/run-record.json` | 已结束 Run 的终态、候选、证据摘要与成本 |
| `releases.jsonl` | 合并后的上线回读记录 |

正在进行的 Run 台账在运行它的机器的 `.buildbeat/runtime/` 中，不进 Git；进度以那一方的 `buildbeat status` 为准。

## 可以写

- **起草或修改 `work.md`**。修改会让已有接受失效，运行时会显示为待接受或已过期。
- **由工作所有者接受 `work.md`**：在 `decisions.jsonl` 末尾追加一行，`digest` 是 `work.md` 文件内容的 SHA-256（例如 `shasum -a 256 work.md`），`decisionRef` 用 `A-<ID>-<当前行数+1>`：

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","decisionRef":"A-WORK-X-1","decision":"approved","transition":"accept-work","subject":{"artifact":"work","digest":"sha256:<64 位十六进制>"},"by":"<姓名>"}
  ```

- **裁决已记录的审查发现**：在 `review-findings.jsonl` 末尾追加一行，`fingerprint` 必须是已有发现的指纹，`action` 为 `accept` 或 `dismiss`：

  ```json
  {"ts":"2026-10-04T08:00:00.000Z","kind":"adjudication","fingerprint":"<指纹>","action":"dismiss","by":"<姓名>","note":"<理由>"}
  ```

- **关闭不需要上线的 Work**（例如只改文档）：追加 `{"ts":"2026-10-04T09:00:00.000Z","decision":"closed","transition":"close-work","subject":{"result":"<结论>"},"by":"<姓名>"}`。需要上线的 Work 用运行时的 `release` 与 `decide --action close` 关窗，关窗会绑定回读记录。

每行必须是完整的一行 JSON，只追加不改旧行。写完后提交（commit），交给装有运行时的一方。

## 不得做

- 批准或拒绝 Run、采纳候选：这些决定由运行时写入 Run 台账，并在盖章前重新回读候选与证据。
- 写或改 Run 台账、`run-record.json`、`releases.jsonl` 或任何证据；声称验证、审查或上线回读已经通过。
- 以别人的名义写决定；修改已有行。

## 交给装有运行时的一方

对方拉取提交后运行 `buildbeat status --repo . --work <ID>`：新改的 `work.md` 显示为待接受，手写的接受行与裁决行按同样的摘要与指纹规则生效。之后 `buildbeat run --config <config>` 继续交付。
