# AGENTS.md — 简账 工作区 · 工作包路由 + 协作总线

> 沙盘说明:真项目此文件是完整版(路由表 + §1.5 审美红线 + 十条规则 + 红线,见 [templates/AGENTS.md](../templates/AGENTS.md));沙盘只展示**填好占位符的路由表**,其余段落与模板一致、此处从略。简账的同一 Builder 端到端拥有一期工作包,产品/全栈/测试只是 AI 视角。
> 根上另有一份 `CLAUDE.md`,只是指向本文件的一行指针(见 [templates/CLAUDE.md](../templates/CLAUDE.md))。

## 1. 工作包路由 —— Builder 端到端负责,会话按 AI 视角隔离

| AI 视角 | cwd | 可写(拥有) | 只读 | 开工先读 | 状态写回 |
|---|---|---|---|---|---|
| **产品**(规格/编排) | `pm/` | `pm/**` | 全仓 | `pm/NOW.md` | 当期看板 + `pm/status/产品.md` |
| **全栈**(实现,含运维) | 工作区根(同持 jz-web、jz-api 两仓) | `jz-web/**` + `jz-api/**`(**按仓分别 stage,不 `git add -A`**) | `pm/*` 当期文件、契约 | 各代码仓自己的 `AGENTS.md` + `pm/NOW.md` | `pm/status/全栈.md`(带 hash)+ 各仓 `CHANGELOG.md` + `contracts/PROTOCOL.md` |
| **测试**(E2E·走查) | `jz-web/` | `tests/**` · 视觉基线 · 走查报告 | 实现 + spec + 设计稿 + 契约 | `pm/NOW.md` + `tests/README.md` | `pm/status/测试.md` + 核查门证据(E2E 报告/视觉 diff/对比图,**落 `pm/archive/<期>/evidence/`,换期零搬运**) |

> 🔴 同一 Builder 合并多视角的补偿控制:一期候选满足 review-ready(两仓 `HEAD=candidate`、工作树干净、L3/渲染证据绿、无待修)后由 reviewer 全核一次 + 测试视角独立核两端;首次 milestone 前写者自发现问题先自行收敛,只有修改冻结对外语义/不可逆副作用才提前 `risk-delta`。写者≠审者不变,但不边改边审。
> 开工/收工护栏:任意会话开工先跑 `bash scripts/bus-check.sh` + 各仓 `git pull`;收工前回写证据/状态并再跑 `bus-check --strict`,warning/unverified 仍需说明。

## 1.5 UI 规范摘要 / 2. 十条规则 / 2.5 任务包与人批节奏 / 3. 红线

(与 [templates/AGENTS.md](../templates/AGENTS.md) 一致,沙盘从略。完整 UI 规范单点见 `standards/DESIGN.md`;规则⑥采用「机器闸常驻 + review-ready 后一次 milestone + P0/P1 合并 closure」;§2.5 规定会话按用户级工作包持续推进,审批分 `STOP_NOW / BATCH_AT_GATE / NO_APPROVAL`,不因每个小任务交还接力棒。)
