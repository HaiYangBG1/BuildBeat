# 决定记录分清人和 AI 会话

## 目标

BuildBeat 对回来的人承诺：看到的是事实，不是 AI 的自述。现在的决定记录做不到这一点。

- 运行时把每个决定都记成"人"：事件里的身份固定写 `kind: "human"`，`--by` 不写时名字默认就是 `human`。驾驶会话（执行工作的 AI 会话）自己批准的决定，和人亲自拍板的决定，记录里看不出区别。
- 结果：lessons.md 第 23 条的"10 次中途停下，9 次由驾驶会话自己批准"，只能靠会话在 `--by` 里自觉写上 `driving-session` 之类的名字才看得出来；没写或写了人的名字，事后就分辨不了。

本 Work 让每条决定如实记下"谁、以什么身份"批的，并在 `status` 里看得到。接下来的团队试点之前先修这一项。

## 待所有者拍板的四件事（接受本说明即按"推荐"执行；要改哪项直接说）

| # | 问题 | 推荐 | 备选 |
|---|---|---|---|
| 1 | 身份怎么定 | 新增 `--as human\|agent`。不写时自动判断：检测到 AI 会话的环境标记就记 `agent`，否则记 `human`。首批识别 Claude Code（`CLAUDECODE`）、通用约定 `AI_AGENT`、Codex 沙箱（`CODEX_SANDBOX`）；其他工具可设 `BUILDBEAT_ACTOR=agent` 自报 | `--as` 必填，不写就报错 |
| 2 | AI 会话转达人在对话里说的决定 | 允许 `--as human --by <人名>`，同时如实记下"在 AI 会话里录入"（`via: "agent-session"`），status 显示"人·经 AI 会话录入" | 在 AI 会话里一律记 `agent`；人的决定必须本人在自己的终端执行 |
| 3 | 名字从哪来 | `--by` 不写时：记 `human` 取 `git config user.name`；记 `agent` 取识别到的工具名（如 `claude-code`、`codex`，识别不出写 `ai-session`）。人的名字取不到就报错，要求写 `--by`。只记名字，不写邮箱 | `--by` 必填 |
| 4 | AI 会话能批哪些决定 | 本次只如实记录和显示，不新增拦截。合并决定点由 `agent` 批准时，status 明确标出"合并批准来自 AI 会话" | `agent` 身份不得接受 work.md、批准合并、关窗，这三处只能记 `human` |

说明：自动判断是兜底，不是防伪。AI 会话可以故意写 `--as human`、清掉环境变量，运行时拦不住；文档会如实写明这一点。能保证的是：没人刻意造假时，默认值不再把 AI 记成人。

## 范围

包含：
- 运行时：所有写决定的入口（批准、拒绝、接受 work.md、接纳手修 `--adopt`、退回修复、问题接受/驳回、关窗）统一取身份；事件身份种类加上 `agent`；`decisions.jsonl`、`review-findings.jsonl` 的裁决行、run-record 的决定列表带上身份。
- 输出：`status --work` 列出本 Work 的每条决定（时间、决定什么、谁、什么身份）；`check` 里"accepted by"带身份；`status --json` 带身份字段；合并批准来自 AI 会话时在 status 标出。
- 文档（中英各一份）：决定与证据指南、不装运行时也能参与（手写决定行的格式）、安全边界（自动判断的局限）、恢复与快速开始里涉及 `--by` 的命令；Skill 的命令表补 `--as` 的用法。CHANGELOG 新增 `Unreleased`。
- 回归测试。

不包含：README、改写旧记录、新增拦截规则（除非第 4 项选备选）、发布、推送。

## 记录格式

`decisions.jsonl` 保留原有 `by` 字段（旧读者照常能读），新增 `actor`：

```json
{"...原有字段...": "...", "by": "alice", "actor": {"kind": "human", "id": "alice", "source": "git"}}
{"...原有字段...": "...", "by": "claude-code", "actor": {"kind": "agent", "id": "claude-code", "source": "env"}}
{"...原有字段...": "...", "by": "alice", "actor": {"kind": "human", "id": "alice", "source": "flag", "via": "agent-session"}}
```

- `source` 记名字的来源：`flag`（命令行写的）、`git`（取自 git 配置）、`env`（取自识别到的 AI 工具）。
- 运行时事件里的身份同样写 `{kind, id}`，`via` 一并记入；`kind` 允许 `agent`。
- 旧记录没有 `actor`：照常读取，status 显示"身份未记录"，不按名字猜。

## 验收

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本 Work 范围内 `git diff --check`。
- 回归测试至少覆盖：
  - 默认值：没有 AI 环境标记、不写 `--by`/`--as` → `human`，名字取 git，`source: git`；git 也没有名字 → 报错并提示写 `--by`。
  - 显式 `--by`（及 `--as`）→ 按写的记，`source: flag`。
  - AI 会话批准：有环境标记、不写 `--as` → `agent`；有环境标记且写 `--as human` → `human` 且 `via: agent-session`。
  - 每个写决定的入口都带 `actor`；事件身份 `agent` 能写入和回放；run-record 的决定带身份。
  - status：`status --work` 列出决定和身份；旧记录显示"身份未记录"；合并批准来自 AI 会话时有标注；`--json` 带字段。
  - 测试自身清掉 AI 环境标记，避免在 AI 会话里跑测试时结果不同。
- 独立只读审查无未裁决的 P0/P1。

## 实施计划

1. 新增一个取身份的小模块（读 `--as`/`--by`、git 名字、环境标记），所有写决定的入口改用它，去掉各处的 `"human"` 默认值。
2. 身份种类加 `agent`；决定行、裁决行、run-record 带 `actor`。
3. `status --work` 加决定列表，`check` 与 JSON 输出带身份，合并批准来自 AI 会话时标注。
4. 回归测试；中英文档与 Skill；CHANGELOG `Unreleased`。

驾驶会话亲自写代码，以 `--adopt` 交给 Run；verify 与 review 由独立 worker 执行。

## 止损

范围变化需要新的决定。审查轮数上限 6 轮（run-config `budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
