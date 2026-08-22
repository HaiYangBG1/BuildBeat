# AGENTS.md — 简账 工作区 · 会话路由 + 协作总线

> 沙盘说明:真项目此文件是完整版(路由表 + §1.5 审美红线 + 十条规则 + 红线,见 [templates/AGENTS.md](../templates/AGENTS.md));沙盘只展示**填好占位符的路由表**,其余段落与模板一致、此处从略。
> 根上另有一份 `CLAUDE.md`,只是指向本文件的一行指针(见 [templates/CLAUDE.md](../templates/CLAUDE.md))。

## 1. 会话路由 —— 开一个会话 = 认领一个域

| 域 | cwd | 可写(拥有) | 只读 | 开工先读 | 状态写回 |
|---|---|---|---|---|---|
| **产品**(规格/编排) | `pm/` | `pm/**` | 全仓 | `pm/NOW.md` | 当期看板 + `pm/status/产品.md` |
| **全栈**(实现,含运维) | 工作区根(同持 jz-web、jz-api 两仓) | `jz-web/**` + `jz-api/**`(**按仓分别 stage,不 `git add -A`**) | `pm/*` 当期文件、契约 | 各代码仓自己的 `AGENTS.md` + `pm/NOW.md` | `pm/status/全栈.md`(带 hash)+ 各仓 `CHANGELOG.md` + `contracts/PROTOCOL.md` |
| **测试**(E2E·走查) | `jz-web/` | `tests/**` · 视觉基线 · 走查报告 | 实现 + spec + 设计稿 + 契约 | `pm/NOW.md` + `tests/README.md` | `pm/status/测试.md` + 核查门证据(E2E 报告/视觉 diff/对比图,**落 `pm/archive/<期>/evidence/`,换期零搬运**) |

> 🔴 全栈域合并多角色的补偿控制:一期候选满足 review-ready(两仓 `HEAD=candidate`、工作树干净、L3/渲染证据绿、无待修)后由 reviewer 全核一次 + 测试域独立核两端;首次 milestone 前写者自发现问题先自行收敛,只有修改冻结对外语义/不可逆副作用才提前 `risk-delta`。写者≠审者不变,但不边改边审。
> 开工护栏:任意域开工先跑 `bash scripts/bus-check.sh` + `git pull`。

## 1.5 C 端审美红线 / 2. 十条规则 / 2.5 任务包与人批节奏 / 3. 红线

(与 [templates/AGENTS.md](../templates/AGENTS.md) 完全一致,沙盘从略。规则⑥采用「机器闸常驻 + review-ready 后一次 milestone + P0/P1 合并 closure」;§2.5 规定会话按用户级工作包持续推进,审批分 `STOP_NOW / BATCH_AT_GATE / NO_APPROVAL`,不因每个小任务交还接力棒。)
