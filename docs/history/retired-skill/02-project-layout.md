# BuildBeat 方法论 · 项目文件布局（原 §3）

> 从 [`SKILL.md`](../../../SKILL.md) 移出的正文，原文与原节号不变，只调整了相对链接；入口、驾驶手册与红线摘要仍在 `SKILL.md`。

## 3. 项目文件布局

```
<项目根>/                          ← 工作区(单仓项目就是代码仓本身;多仓项目是协调层 meta 仓)
├── AGENTS.md                      # 会话路由 + 协作规则 + 红线(开放标准,按工具装载)
├── CLAUDE.md                      # 一行指针 → AGENTS.md(兼容只认此名的工具;🔴 不复制内容)
├── 指挥台.md                       # 给人看的一页:日常六句话、视角开场白
├── BUILDBEAT.md                   # 运行时版本标记 + 升级/回灌说明
├── ARCHITECTURE.md                # 全栈总图(多仓项目;按需读,不自动装载)
├── contracts/PROTOCOL.md          # 跨边界契约唯一入口(多仓项目;单仓可无)
├── standards/                     # 可选:STACK / CODE / REVIEW / DESIGN(Policy 输入工件,默认不生成)
├── pm/decisions.md                # 🔴 平台级拍板台账(全工作区决策单点);可选 pm/adr/
├── delivery/
│   ├── envelope/                  # worker.sh + builder / reviewer / fixer prompt(仓级,进 Git)
│   ├── work/<WORK-ID>/            # intent.md / plan.md / run-config.yaml / workflow.yaml / decisions.jsonl
│   │   └── runs/<RUN-ID>/         #   run-record.json(终态记录,进 Git)
│   └── observe/intents/           # observe 的 Intent 草稿(人分诊,绝不自动执行)
├── .buildbeat/
│   ├── notify.yaml / observe.yaml # 通知通道(URL 只走环境变量)/ 生产体检配置
│   ├── runtime/                   # 🔴 事件台账、锁、日志(本机,不进 Git)
│   └── worktrees/                 # 🔴 每个 Run 的隔离工作树(本机,不进 Git;gc 清)
└── <代码子仓们>/                   # 多仓项目:各自独立 git + 该仓自己的 AGENTS.md(只写本仓局部细节)
```

> 🔴 **装载入口走开放标准 `AGENTS.md`,不绑厂商**(lessons.md「上下文载体绑死单一厂商」)。标准语义 = 会话从被编辑文件所在目录**向上收集沿途所有 `AGENTS.md` 合并、离得最近的优先**,所以「根写全局、子仓写局部」是白捡的层叠能力,不用自己发明。只认 `CLAUDE.md` 的工具靠根上一份**一行指针**兼容(内容单点在 `AGENTS.md`,复制过去 = 自造 SSOT 腐烂;也别用符号链接,Windows 上 git 默认 `core.symlinks=false` 会静默退化成文本文件)。同理**不要**引入 gitignore 的本地覆盖文件(如 `AGENTS.override.md`):本文件装的是红线与护栏,允许不进 git 的本地覆盖 = 给绕过护栏开后门,reviewer 与 pre-commit 都看不见。
>
> **不建进度文件、状态文件或看板**:进度由内核从台账与 Git 回读(`overview` / `status`),写进文档的进度从写下那一刻开始腐烂(lessons.md「SSOT 腐烂」)。`.gitignore` 排除 `.buildbeat/runtime/` 与 `.buildbeat/worktrees/`;有 vitest / jest / pytest 的仓另配 exclude `**/.buildbeat/**`,否则主干测试会把旧候选的用例一起跑。
