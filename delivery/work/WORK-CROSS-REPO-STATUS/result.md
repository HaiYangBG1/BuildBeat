# 跨仓总览：结果

范围与对外名字见 [work.md](work.md)。builder 与 fixer 是 codex worker（随包 4.0 提示词），verify 跑本地全量检查，review 是三路并行只读 codex。RUN-CROSS-REPO-STATUS-01 以 SUCCEEDED 结束，候选 `14cee4e` 已快进合入 `v2`；推送、合并到 main 与发布另行决定。

## 交付

- `buildbeat status --repo <主仓> --all-repos`：找仓范围是主仓、主仓 run 配置 `repo:` 指向的仓、主仓下一层含 `delivery/work/` 的 Git 仓，按真实路径去重，不递归；先列待人决定，再按仓列未了结工作，已了结的只计数；`--json` 含全部工作；`--work` 跨仓筛选；`--run` 与 `--all-repos` 同用会被拒绝。
- 主仓单仓 `status`：配置指向另一个仓、且那个仓已有记录的工作，改为显示那个仓里的状态，命令用主仓配置和相对当前目录的路径。

## 过程

| 轮次 | 发现 | 处理 |
|---|---|---|
| 1 | 8 P1 + 1 P2 | 首个配置损坏时的归属判断、多配置时的回读信息、单仓 JSON 兼容、git 调用缓存；测试改为真实 CLI 决定、补下一层子仓发现与 JSON 已了结断言、隔离宿主 git 配置；Skill 一行写明适用条件。fixer 第 1 次全部修复 |
| 2 | 1 P1 | 第 1 次修复引入：目标仓无记录时的命令仓路径。fixer 第 2 次修复 |
| 3 | 0 | 进入合并决定 |

每轮阻断数都少于上一轮，属于收敛，内核没有停下找人。裁决全文见 [review-findings.jsonl](review-findings.jsonl)，决定见 [decisions.jsonl](decisions.jsonl)。codex 用量：builder 约 10.7 万 token，两次 fixer 约 8.4 万和 6.3 万；worker 计时 29 分钟。

## 验证

- `verify.sh` 第 3 次通过：Node 回归 315 项、文档检查、Bash 信封、Claude 插件、安装后首跑、Work 范围 `git diff --check`。
- 合并前人工对照（试点工作区：主仓 + 5 个代码仓，另一工作区：主仓 + 1 个代码仓，加本仓）：7 个代码仓的单仓 `status` 文本与 JSON 和 4.0.0 完全一致；试点主仓的误报已修正；`--all-repos` 在试点工作区约 120 项工作中只列出 1 项未了结，其余按仓计数，耗时约 9.5 秒。

## 已知遗留（转入 WORK-RUNNABLE-HINTS）

- 本仓 `WORK-V2-M1-ACCEPT`（有运行、无工作说明）的单仓显示从 `NO_INTENT` 变为 `STOPPED_CANCELLED`，违反"其他输出不变"；三路审查与回归测试都没发现。
- `--all-repos` 的分组标题、计数行与"所在仓""运行目标"两行是中文，命令行其余输出是英文；所有者决定改为英文。
- 试点主仓的单仓 `status` 因读取目标仓记录，从约 1 秒变为约 6 秒。
