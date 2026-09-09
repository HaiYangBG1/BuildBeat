# Changelog

> 本项目吃自己的狗粮(红线④:必更 CHANGELOG)。格式循 Keep a Changelog,倒序。

## Unreleased

> **3.0.0（破坏性变更）**：v1 已移除。需要 v1 文件总线或 `buildbeat doctor/init/adopt/upgrade` 的项目请停留在 2.0.2；3.0.0 起仓库与包只描述一个产品。

- **可执行文件只剩 `buildbeat`**：它就是运行时（原 `buildbeat-v2`）；`buildbeat-v2` 与 `solobaton` 两个入口删除。新增 `buildbeat --version`。所有文档、模板、信封、`overview` / `inbox` / 通知里可复制的下一句命令统一改名。
- **删除 v1 面**：生命周期 CLI 源码（`src/cli.js`、`constants.js`、`doctor.js`、`planner.js`、`project.js`、`upgrader.js`、`writer.js`）、文件总线模板（`templates/AGENTS.md` 等根模板、`pm/NOW.md`、当期看板、`pm/status/`、`pm/changes/`、`templates/scripts/` 五个脚本、`.claude/agents/reviewer.md`）、教学沙盘 `example/`、`docs/CLI.md`、`docs/CHECKS.md`、`docs/LEGACY-V1.16-MIGRATION.md`、`docs/v2/guide/08-migration-v1.md`、`legacy-four-gates` 风险预设，以及它们的测试（`tests/cli.test.js`、`test-scripts.sh`、`skill-only.test.sh`、`tests/fixtures/`）。保留并改写为运行时口径的模板：`pm/decisions.md`、`pm/adr/`、`standards/`、`contracts/PROTOCOL.md`、`ARCHITECTURE.md`、`gitignore.template`。
- **SKILL.md 重写为单一产品**：§3 项目文件布局、§4 十一条协作规则（指向 `templates/v2/AGENTS.md`）、§5 风险预设决定人批点、§6 三个仪式与读数表、§8 Bootstrap 只剩一条路（含验证命令与 worker 工具自查、通知一问）、§8.5 接管存量项目按 `allowedPaths` 划边界；frontmatter 触发词去掉旧名。`lessons.md` 22 条：只对文件总线成立的 3 条删除，其余解药改指运行时机制并重新编号。
- **文档**：README 中英去掉 v1 折叠段与迁移指南链接；能力矩阵改为三个可用面；docs 索引、发布手册、贡献指南、tests/README、插件 README 同步；RFC-0001 §6 与 RFC-0003 预设表加 2026-09-09 生效修订注，正文保留。带日期的历史文件（试点、路线、发布证据、`CHANGELOG-v1.md`）原样留在仓库，不进包。
- **守卫**：`tests/check_docs.py` 重写——删除面的路径不得回归（`REMOVED_PATHS`），现行文档不得再出现旧可执行文件名、旧产品名、文件总线与固定 Gate 词汇；`package.json` 只允许一个 bin；插件版本 0.2.2 → 0.3.0（不再链接 `example/`）。CI 去掉文件总线脚本套件，作业名不变；发布 workflow 只探测 `buildbeat`。
- **体积**：npm 包 137 → 85 个文件，压缩约 340 kB → 212 kB，解压约 963 kB → 578 kB。

- **CHANGELOG 拆分**：v1 系列条目（v1 ～ v1.21.0，约 55 kB，占原文件近三分之二）原文不改地移到仓库根 [`CHANGELOG-v1.md`](https://github.com/HaiYangBG1/BuildBeat/blob/main/CHANGELOG-v1.md)，根 `CHANGELOG.md` 只保留 v2 系列并在末尾指向它；新文件不在 `package.json` 的 `files` 里，不随 npm 包分发，`tests/pack-firstrun.test.sh` 断言包内有 `CHANGELOG.md`、没有 `CHANGELOG-v1.md`。版本史仍只在 CHANGELOG 一处维护，只是按大版本分了两个文件。

## v2.0.2 — 2026-09-09（补丁：npm 包不再携带历史文档）

> **发布状态**：`@haiyangbg/buildbeat@2.0.2` 已于 2026-09-09 从 `main`（PR #33，merge commit `a077367`，tag `v2.0.2`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 34351668694，双 job success；所有者授权「发 2.0.2」）。独立回读（直连 npmjs.org）：`latest` = 2.0.2、integrity 与本地 dry-run 一致、attestation、隔离安装、`doctor` 有界 JSON、包内 `docs/` 24 个文件且无历史文档全过，GitHub Release v2.0.2 标 Latest，证据见 [`docs/V2.0.2-RELEASE-EVIDENCE-2026-09-09.md`](docs/V2.0.2-RELEASE-EVIDENCE-2026-09-09.md)。

- **npm 包不再携带历史文档**：`package.json` 的 `files` 显式排除发布证据、迭代记录、阶段试点、路线与规划类文件（`docs/*-RELEASE-EVIDENCE-*.md`、`V2-ITERATION-*`、`PHASE*`、`V2-PLAN/PROPOSAL/DECISIONS`、`ROADMAP`、`EXECUTION-PLAN`、`CLI-STRATEGY/PILOT`、`docs/v2/M1/M2/M4-*` 与 v2 长文），它们只留在仓库；现行文档（总入口、v1 CLI 合同与检查、能力矩阵、迁移、发布手册、RFC/SPEC、十件套指南）照常分发。包内 `docs/` 从 61 个文件降到 24 个，压缩包约 497 kB → 362 kB，解压约 1.3 MB → 1.0 MB。安装目录里现行文档指向历史文件的链接会落空，`docs/README.md` 已说明去 GitHub 看。回归：`tests/pack-firstrun.test.sh` 新增两条断言——每份现行文档都在包内、历史文件一个都不在。运行时行为不变。

## v2.0.1 — 2026-09-06（补丁：合同与文档同步、`env:` 透传修复、v2 模板与首跑回归、首页重写）

> **发布状态**：`@haiyangbg/buildbeat@2.0.1` 已于 2026-09-06 从 `main`（PR #29，merge commit `4b2362f`，tag `v2.0.1`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 34032278315，双 job success；所有者授权「发」）。独立回读（直连 npmjs.org）：`latest` = 2.0.1、integrity 与本地 dry-run 一致、attestation、隔离安装、`doctor` 有界 JSON、包内 `templates/v2/envelope/` 全过，GitHub Release v2.0.1 标 Latest，证据见 [`docs/V2.0.1-RELEASE-EVIDENCE-2026-09-06.md`](docs/V2.0.1-RELEASE-EVIDENCE-2026-09-06.md)。

- **首页与简介（C 批次）**：中英文 README 围绕项目上下文与持续交付重写,暂用“会话随时换,项目接着干”标语;突出 Git 与文件上下文、跨模型/工具/会话/人员接续、多角色协作和交付 Loop,个人使用与团队接力均为适用场景;包与插件简介同步(插件版本 0.2.1 → 0.2.2)。新增中英文跨会话与团队接续指南,区分聊天删除、跨成员交接、运行恢复和跨机器同步;场景示意不冒充实测。README 与快速开始说明新模板随下一个补丁版发布(不再教源码全局安装);角色表收回 SKILL 的产品/全栈/测试三视角,审查归入 Run 内置只读 reviewer;首段补"进度与证据由内核回读";标语改为 H1 下的加粗行。README 检查改为必要入口和中英结构一致性,不再固定旧标题。

> 2.0.0 之后的对外说明同步（A 事实与合同 → B 使用路径 → D 防回退 → C 首页），四批各一个 PR（#24、#27、#26、#28）合入 `main`；运行时只有一处行为修复（`env:` 透传），v1 生命周期命令与骨架 `v1.21` 不变；插件 manifest 描述随首页同步，版本升 0.2.2。

- **修复：run 配置的 `workers.<角色>.inheritEnv` 与 `env:` 在 CLI 加载路径被丢弃**。`doctor` 按配置报告 env 姿态，`start` / `resume` 却总按默认白名单起 worker，`env:` 点名注入的变量到不了子进程（Adapter 指南承诺的能力在 CLI 侧从未生效；直接调用 `createShellAdapter` 的 API 用户不受影响）。现在两字段透传到 Shell Adapter，`env:` 值必须是标量、变量名必须合法，否则加载配置时报错。回归：`tests/v2-run-cli.test.js` 新增"env 姿态经 CLI 到达 worker"（allowlist 下宿主变量不泄漏且 `env:` 可达；`inheritEnv: true` 下宿主变量可见；非法变量名被拒）
- **Worker 合同文档与解析器对齐**：finding 每条要求 `severity`（`P0`–`P3`）与字符串 `summary`（此前文档写 `title` 与 `P1|P2|P3`）；阻断的是 P0/P1（此前写 P1/P2）；格式错误 = `invalid-output` 判 `infra` 停人、不派 fixer、不扣预算（此前写"按失败处理"）；没配 `fixer` 时到 fix 步停人等接手，不是自动修。快速开始与 Skill 的 run-config 样板补 `fixer`，改成解析器可直接读的块列表，reviewer prompt 写明信封形状
- **安装通道统一稳定版**：快速开始、迁移指南、Skill §0.5 的 `@next` 全部改为 `@latest`（2.0.0 起 `latest` 即 v2）；快速开始按"安装 → 工作项 → run 配置 → accept → doctor → start → 看证据 → 失败分支 → 恢复"重排，workflow 预设改为复制进工作项目录（digest 随项目进 Git），耗时不再写"5 分钟"
- **批准语义统一**：Approval 指南新增"接受 / 批准某转换 / 合并决定 / Run SUCCEEDED / 拒绝"五词对照表；Skill、指挥台、v2 AGENTS 模板、how-to-talk 中"批准=merge-ready"改为按 transition 说清批的是哪一步，非终态批准后需 `resume`，`SUCCEEDED` ≠ 已合并
- **安全边界分层**：安全指南每条边界分"内核实际做到的（检测或移除）"与"不能由此推出的"两栏；无人值守前置条件分内核 / 宿主 / 服务端三层，内核不再被描述为保证宿主层
- **发布手册与 RFC 历史口径**：`docs/RELEASING.md` 不再同时写"2.0.0 是 latest"与"latest stable 是 1.21.0"，旧回读标注日期；RFC-0001 §6 加生效修订说明"`latest` 留 v1"已于 2026-09-05 结束，原文保留
- **模板**：指挥台"每个 session 自动读 AGENTS.md"改为按工具装载方式；开工示意先 `doctor` 再 `start`；迁移指南分清"升级 CLI"与"迁移项目状态"，时间改为估算并给出迁移前后可核对目录
- **防回退（D 批次）**：`tests/check_docs.py` 新增"现行文档时效"检查——把 README、SKILL、CONTRIBUTING、CLI、能力矩阵、RELEASING、十件套指南、`templates/v2/*.md`、插件 README 列为现行文档，禁止再出现 `@next` 安装行、"latest 仍是 v1"、`title`/P1–P3 的旧信封形状、"P1/P2 阻断"、"任意会话自动装载"、"批准=merge-ready"这类本轮实际发现过的失效说法；SKILL frontmatter 描述限长 1024 且必须提到 `buildbeat-v2`；README 形状约束放宽（最终按 C 批次检查中英结构、命令与必要入口），README 不再被要求保留六句 v1 分发史文案（事实改由能力矩阵与 CLI.md 守卫）；package.json description 改为形状校验（以 BuildBeat 开头、40–300 字、必须提到人的决定点、不得含 solo 类受众词），不再要求整句旧文案；RELEASING 必须含"Channels and branches"与"Post-release synchronization checklist"两节
- **修复：`tests/pack-firstrun.test.sh` 在 `npm publish --dry-run` 触发的 `prepublishOnly` 下失败**（父 npm 把 `npm_config_dry_run` 传给嵌套 npm，`npm pack` 不产 tarball）：脚本先清掉该变量。真实发布走 pack 后 publish tarball，不经 `prepublishOnly`，不受影响；发布手册的候选检查恢复可用
- **打包首跑回归 `npm run test:pack-firstrun`**（`tests/pack-firstrun.test.sh`，已进 CI 的 CLI 矩阵与 `prepublishOnly`）：`npm pack` → 隔离 `--prefix` 全局安装 → 用**安装后的** `bin/`、预设与 `templates/v2/envelope/` 按快速开始的顺序 accept → doctor → start，脚本 worker 走到合并决定（含 verify 失败→fixer）。源码树测试抓不到 `files` 漏文件，这条能
- **维护文档**：`CONTRIBUTING.md` 重写——文档权威分层（Skill = 使用路由与行为；RFC/SPEC = 规范；代码与测试 = 现状；冲突即 bug）、分支与发布策略（main 保护、七项必需检查、日常在 v2、稳定版从 main 顶端出、预发布到 next）、全部测试命令、lessons / evals 只收真实事故且先红后绿；`docs/RELEASING.md` 新增通道与分支表、发布后同步清单（CHANGELOG、证据、README、Skill、CLI/矩阵状态行、RFC 修订注、GitHub About、Release Latest 标记、插件版本、docs 检查）；`tests/README.md` 重写为分层表（每层证明什么、不证明什么），插件身份改 0.2.1；新增 `docs/README.md` 总入口，现行与历史分开；`V2-PLAN.md` 顶部加"已交付、此后为历史基线"状态更新
- **v2 成为 Skill 的默认入口（B 批次）**：SKILL §8.0 按目录形态路由——已有 `delivery/` 继续 v2、有 `pm/NOW.md` 的 v1 项目给出继续或迁移两条路、什么都没有的项目默认 v2；§8.2 明确为 v1 文件总线路径，新增 §8.3 v2 生成 checklist（装载入口 → 台账 → 信封 → 第一个 Work → 通知 → 机器闸 → 首跑验收 → 收尾）；§8.5 接管存量项目骨架默认 v2，`adopt` 只在选 v1 时跑
- **`templates/v2/` 补齐**：`CLAUDE.md`（一行指针）、`BUILDBEAT.md`（运行时版本标记，升级 = 升级 CLI）、`run-config.example.yaml`（可原样解析，含 fixer / reviewTriage / budgets / cache / envelope / redact）、`envelope/worker.sh`（工具缺失 exit 75、喂 `$BUILDBEAT_PROMPT`、写入步机械 commit、只读步落信封）与 builder / reviewer / fixer 三份 prompt。回归 `tests/v2-templates-firstrun.test.js`：脚本 worker 从这套模板走到合并决定（含 verify 失败→fixer→重验），并验证 SKILL 与快速开始里的每个 run-config 样板都能被严格 YAML 子集解析——顺带发现并修正了样板里三处会让 `doctor` / `start` 直接报错的写法：解析器不支持的行尾注释、内联 prompt 中的冒号、JS RegExp 不支持的 `(?i)` 内联标志（`redact` 样板）
- **文档口径**：快速开始与 Skill 样板改用 `delivery/envelope/`；Worker 合同的 fixer 行改为实际输入（review `findings[]` 含裁决状态；verify 失败时输入无失败摘要，日志在 `.buildbeat/runtime/runs/<RUN>/logs/`）；十件套索引按"第一次使用 / 日常使用 / 配置参考 / 迁移"重排；指南各节标题去掉"（迭代 08）"类内部编号，改为"自 2.0.0-beta.x 起"出处行；能力矩阵新增"四个可用面"与 v2 运行时能力表，v1.21 条目原样保留；`docs/CLI.md` 明确本页只是 v1 生命周期 CLI 合同并加"两个可执行文件各管什么"；v2 AGENTS 模板改为按工具装载、开工护栏改 `overview`（只有 v1 迁来的仓才跑 `bus-check`）、信封目录约定

## v2.0.0 — 2026-09-05（正式版：v2 成为 `latest`）

> **发布状态**：`@haiyangbg/buildbeat@2.0.0` 已于 2026-09-05 从 `main`（PR #22，tip `95e780e`，tag `v2.0.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 33974396871，双 job success；所有者授权「正式发布」）。独立回读（直连 npmjs.org）：`latest` = 2.0.0、integrity、attestation、隔离安装、`doctor` 有界 JSON 全过，GitHub Release v2.0.0 标 Latest，证据见 [`docs/V2.0.0-RELEASE-EVIDENCE-2026-09-05.md`](docs/V2.0.0-RELEASE-EVIDENCE-2026-09-05.md)。

- **内容与 `2.0.0-beta.5` 同源**（迭代 01～09 的全部 v2 运行时、Skill §0.5 驾驶手册、`templates/v2/`、十件套指南、lessons #1–#25），外加 README 中英文的「当前主线是 v2」段与 `docs/CLI.md` 的 2.0.0 状态行。
- **对拷出项目意味着什么**：v1 文件总线、`buildbeat` 生命周期命令（`doctor` / `init` / `adopt` / `upgrade` / `version`）与安全边界**不变**，schema 仍是 2；`npm install --global @haiyangbg/buildbeat@latest` 现在同时给出 `buildbeat` 与 `buildbeat-v2`。骨架版本仍是 `v1.21`（模板未变，`buildbeat upgrade` 对 1.21 骨架报 up-to-date，不需要 `--major`）；manifest 里的 `cliVersion` 只是记录，不触发升级。v2 运行时是可选叠加：按 `docs/v2/guide/08-migration-v1.md`（已于 3.0.0 移除）建 `delivery/work/` 与 run 配置即可，不动现有 `pm/` 与 `contracts/`。
- **分发口径**：`latest` 从 1.21.0 切到 2.0.0；`next` 保留给后续预发布；旧 `solobaton` 包不变。

## v2.0.0-beta.5 — 2026-09-05（迭代 09：预算是刹车、故障分开算、成本看得见）

> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.5` 已于 2026-09-05 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33972774150，双 job success；所有者授权「发，并且迭代5轮可以直接切换到线上版本了」）；`latest` 保持 v1.21.0。独立回读（直连 npmjs.org）：dist-tag 路由、integrity、attestation、隔离安装、`doctor` 有界 JSON 全过，证据见 [`docs/V2.0.0-BETA.5-RELEASE-EVIDENCE-2026-09-05.md`](docs/V2.0.0-BETA.5-RELEASE-EVIDENCE-2026-09-05.md)。所有者本机 CLI 已从源码链接切回正式包。
> 来源：试点工作区 2026-09-03～09-05（beta.4 之后）全部驾驶会话、约 60 个 worker 会话与两个子仓 50 个 Run 台账的复盘回灌（迭代 09，lessons #23–#25），以及 2026-09-05 收尾清理回灌。台账数字：50 个 Run 成功 12、作废 16、取消 17、失败 5，支撑 7 次生产发布；所有者问"多久了正常吗"从十余次降到 1 次。

- **预算续批不再死循环，run 配置可覆盖预算（迭代 09 A1）**：预算耗尽停人后批准 `resume-<step>`，内核落 `BUDGET_EXTENDED`（台账事实，可重放）给该步 +1 再跑，不再立刻重问；run 配置 `budgets.maxAttempts.<step>` 覆盖预设（run config > preset > `maxAttemptsPerStep`）；`doctor` 打印每步生效上限与来源。真实事故：两条应用登录 Run 因预设 2 轮改不动且批了没用而以 CANCELLED 收场，候选却已在生产
- **worker 基础设施故障停人，不杀 Run、不派 fixer、不扣预算（迭代 09 A2）**：timeout / crashed / invalid-output / 退出码 75（`EX_TEMPFAIL`，verify 或包装脚本的"环境不可用"信号）判 `infra`：`STEP_FINISHED.data.infra`、`steps[step].infraAttempts` 抵回预算、不记失败指纹、停 `WAITING_HUMAN`（kind `infra`，`resume-<step>`）。没有转移边的失败结果也改为停人；终态 FAILED 只剩 policy BLOCK。mock 适配器新增 `env-fail`。真实事故：worker 后端 404 与非 JSON 输出两天杀 5 个 Run；PATH / 端口 / 负载类 verify 失败派了 5 次 fixer
- **Work 级成本与跨 Run 的 review 轮数上限（迭代 09 A3）**：`overview` 每个 Work 一行 `cost: review rounds · findings · human waits · [infra failures] · worker 时长`（运行时台账优先，run-record 新增 `cost` 块兜底）；`budgets.reviewRoundsPerWork` 跨本 Work 所有 Run（含作废）累计，达标在 review 起跑前停人（kind `work-review-cap`，`enter-review`），批准即多审一轮（`BUDGET_EXTENDED scope=work`）。intent 模板与 Skill 加"止损线"。真实事故：一个 Work 21 个 Run、9 轮 review，每 Run 2 轮封顶从未触发；另一个烧了 10 个 Run 一天后被砍
- **overview 真相修正（迭代 09 B1）**：任一候选已在当前分支即 `MERGED`（最新 Run 是 CANCELLED 也一样，`next:` 注明）；`release-readback` 车道成功关窗显示 `RELEASED`，不再说 "nothing to merge"；已合并/已发布/已关闭的 Work 不再提示未裁决 finding；run-record 新增 `workflow`
- **`doctor` 读 start 第一道门会读的事实（迭代 09 B2）**：打印本仓 `delivery/work/<ID>/` 的 intent / plan 存在与接受状态，对每条 `artifact.accepted` 类 policy 预告 start 会停在哪一步（文件缺失时提示先镜像）
- **`resume --adopt <sha> --by <名字>`（迭代 09 B3）**：人或驾驶会话在 Run 的 worktree 里手修并提交后，跳过 fixer 从 verify 续跑；内核回读 git（树干净、HEAD = sha），以人为 actor 落 `CANDIDATE_PINNED`（`adopted`）与 `DECISION_RECORDED`（`adopted` / `resumeAt`）
- **起跑被仓锁挡住时说清在等谁（迭代 09 C）**：`start` 遇 "another run is active" 打印持锁 Run、所在步与最后事件时间、可复制的 `status` 命令；锁本身未放开
- **模板与指南**：`.gitignore` 模板排除 `.buildbeat/runtime/` 与 `.buildbeat/worktrees/`，指南给出 vitest / jest / pytest 排除写法（试点主干测试曾把残留工作树的用例一起跑）；v2 AGENTS 模板第 ⑨ 条 worker 环境事实（沙箱不能监听端口、PATH 只认 POSIX、环境不满足 `exit 75`）；Skill 驾驶手册：首次写 run-config 问一句要不要启用通知（试点未启用，一张合并卡隔夜等 9.5 小时）、`infra` 停人时怎么答、手修用 adopt、开工前先 doctor
- 测试：新增 `v2-budget` / `v2-infra` / `v2-work-cost` / `v2-overview-stages` / `v2-doctor-work` / `v2-adopt` / `v2-active-lock` 七组 25 项；既有 `invalid-output` / 无转移边 / metrics 三处断言按新语义改写

- **`overview` 认得「已关闭」的 Work**：`delivery/work/<ID>/decisions.jsonl` 里一行 `{"transition":"close-work","decision":"closed"|"cancelled","subject":{"result":"…"}}` 即让该 Work 显示 `CLOSED` / `CANCELLED` 并带关闭时间与结果，不再把 12 个已关闭的 Work 报成 `READY_TO_RUN` 并催写 run-config；仍有 `RUNNING` / `WAITING_HUMAN` 的 Run 时活 Run 优先，关闭行藏不住待办。`READY_TO_RUN` 的 `next:` 提示改成给出这行的精确形状（此前只说「record the work as closed」却没有任何读者）。
- **`bus-check` 多仓 map 适配多模块仓与无契约版本域的仓**：`buildbeat-multirepo-map:v1` 行可选第 4 字段 `changelog=<repo 内模块 CHANGELOG 路径>`（根下没有 CHANGELOG 的多模块仓由某个模块 CHANGELOG 承载契约版本），`contract=n/a` 表示该仓没有契约版本域（只读存量前端、npm 包 semver 与契约版本不同域），只登记不核对。越出本仓的 `changelog=` 路径、非 `contracts/*.md` 且非 `n/a` 的契约值仍判 map 无效；被核对的 CHANGELOG 首个已发布 H2 须以契约快照版本开头（`## [v1.3 · Deployed …]`）。模板 `contracts/PROTOCOL.md` 注释与脚本测试同步。

## v2.0.0-beta.4 — 2026-09-03（迭代 08：等待要能找到人）

> 主题：试点工作区 2026-08-28～09-02 全部驾驶会话与 58 个 Run 台账的复盘回灌（复盘文档见迭代 08 记录）。台账数字：58 个 Run 成功 7、失败 17、取消 32，其中多数取消是在 WAITING_HUMAN 挂满一天后批量清掉；人批平均等 7～12 小时。beta.3 治的是"审查循环烧钱"，本版治的是**人看不见 Run 在干什么、等的人不知道有东西等他、每次都要手工打扫**。
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.4` 已于 2026-09-03 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33728863042，双 job success；所有者授权「发布 beta.4 吧，授权也一起」）；`latest` 保持 v1.21.0。独立回读（直连 npmjs.org）：dist-tag 路由、integrity、attestation、隔离安装、`doctor` 有界 JSON 全过，证据见 [`docs/V2.0.0-BETA.4-RELEASE-EVIDENCE-2026-09-03.md`](docs/V2.0.0-BETA.4-RELEASE-EVIDENCE-2026-09-03.md)。

- **运行中可见性（C1）**：Shell Adapter 把 worker 的 stdout/stderr **实时**流到 `.buildbeat/runtime/runs/<RUN>/<step>-<n>.{stdout,stderr}.live`，并留 `live.json` 标记（命令、开始时间）；步结束即收回，证据日志仍由回读生成。`status` 现在显示每步耗时（本次 / 累计 / 同仓同步骤历史中位数 `typical … n=`）、在飞步骤的已用时间、worker 命令、最后一次输出距今多久与末三行输出；无输出超过阈值（默认 15 分钟，run 配置 `stallAfterMs` 或 `status --stall-after <分钟>`）标 **STALLED**（只标不杀）。`metrics` 增加每步中位耗时。真实事故：所有者一场会话里问了十余次"半小时了正常吗 / 十分钟了是卡住了吗"，而 status 只有步骤和次数
- **同 Work 新 Run 自动取代旧的等待（C2）**：`start` 时同一 Work 下仍在 `WAITING_HUMAN` 的旧 Run 记 `RUN_TERMINAL SUPERSEDED` 并压成 run-record（Git 面），新 Run 的 `RUN_CREATED.data.supersedes` 记血统；inbox 只剩活的等待。run 配置 `supersede: off` 关闭。真实事故：试点子仓两个旧 Run 在 inbox 挂了一天，而后继者早已上线
- **`gc`：打扫运行时面（C3）**：`buildbeat-v2 gc --repo .` 默认只出计划；`--apply true` 执行。规则 fail-closed 向保留：只动**终态且已压成 run-record** 的 Run；工作树可删（提交都在分支上）；分支只在候选**已可从其他 ref 到达**（合并 / 打 tag / 远端）或 Run 未产出候选时删，否则明示"仅此分支可达，保留"；脏工作树不带 `--force` 不动；终态 Run 的残留锁一并清。台账不写（终态后只允许 `RUN_COMPACTED`）。真实事故：两个子仓残留 16 个工作树，所有者原话"你先打扫一下卫生"
- **人批通知出站（C4）**：Git 面 `.buildbeat/notify.yaml` 声明通道（`type: webhook|dingtalk`，URL 只能来自 `urlEnv` 指定的环境变量，写 `url` 直接拒绝），订阅 `HUMAN_REQUESTED` / `RUN_TERMINAL` / `STALLED`。Run 停在人批或终态时由 CLI 出站；失败只记 `notify.log` 与屏幕，**永不影响 Run**；载荷只有标识、原因、候选 SHA 与下一句可复制命令，零日志零候选内容。订阅 `STALLED` 时 `start`/`resume` 自动派一个脱离的 `watch` 进程盯输出静默（编排器在 spawnSync 里看不了表），Run 离开 RUNNING 或父进程退出即自行结束；`watch --once true` 可手工单次探测。`doctor` 报告通道与环境变量是否就位
- **"下一句该说什么"**：`status` / `inbox` / 通知在每个等待后面直接给出可复制的 `approve` / `reject`（分诊时加 `findings list|adjudicate`）命令；`inbox` 按 Work 分组并显示已等待时长。输出里 `--repo` 只在项目内给相对路径，项目外给 `<repo-path>` 占位——本机绝对路径永不进输出（既有不变量，测试守着）
- **Work 级总览 `overview`（C5）**：`buildbeat-v2 overview --repo . [--work <ID>] [--json true]` 按 Work 回答「走到哪、下一步该谁」：intent/plan 是否被接受（接受后改过即 `stale`）、Run 数、最新 Run 状态与候选、候选是否已合入当前分支、未裁决 P0/P1 数、是否有 `env-facts.md`；阶段机 `NO_INTENT → INTENT_DRAFT → PLAN_DRAFT/PLAN_STALE → READY_TO_RUN → RUNNING → WAITING_HUMAN/MERGE_DECISION → MERGE_READY → MERGED`，每行附下一句命令。运行时被删后由 Git 面 run-record 补足。所有者原话：「当前代办是什么，从每一个系统的进度说」「pilot-web 上线了吗，离上线还有多远」
- **信封一等公民（C6）**：run 配置 `envelope:`（`prompts:` 目录 + `vars:` + 可选 `pin: <sha>`）——内核按 `<component>-<worker>.md` / `<worker>.md` 取 prompt、替换 `{vars.x}`、落到 `runs/<RUN>/prompts/<step>-<n>.md` 并以 `BUILDBEAT_PROMPT` 与 `input.envelope` 交给 worker；worker args 支持 `{prompt}` 与 `{vars.x}`；`RUN_CREATED` 记 `envelopeDigest`/`envelopeSource`（additive）。`start --attempt new` 自动编号 `RUN-X-01/02…`（扫运行时面与 Git 面 run-record），一份 config 跑到底，不再每次重试新建 config。`redact:` 正则列表在证据落盘前脱敏（digest 绑脱敏后文本）。真实事故：三源 runner 的 Work 每个 Run 手写 34 行 yaml + 10 KB worker.sh + 4 份 prompt，worker 命令是 `git show <meta sha>:path | bash -s` 咒语，Run ID 手工编到 -30
- **verify 复用与增量审查（C7）**：run 配置 `cache: {verify: tree}` 后，同树（`HEAD^{tree}`）+ 同 worker 命令 + 同信封 digest 且**已通过**的 verify 不再跑——证据引用来源 Run（`EVIDENCE_RECORDED.reused`，additive），status 标 `(reused from RUN-X)`；失败永不复用，脏树不复用。readonly（reviewer）步的 input 注入 `lastReviewed {candidate, run, range}`（同 Work 最近一次 review 的候选且为当前候选祖先），prompt 可据此只审增量。瘦身计划 A1/B3；试点工作区信封侧自建缓存 25→13 分钟的内核化
- **合并后车道（C8）**：官方预设 `release-readback`（preflight → apply-readback → observe → wait-close，全部 readonly、`grade: L4`、`maxAttempts 1`）+ 风险预设 `release`（`stopAt: apply-readback`，关窗要求 L4 命令证据）。生产动作仍是人的（不变量 20）；这条车道只把「做之前回读 → 人做 → 做之后回读 → 观察 → 人关窗」记成台账，任一步失败即停人批。workflow step 新增 `grade:` 字段（additive）。真实事故：试点项目上线当天 meta 仓约 40 条「Gate4 step N readback」手工提交
- **可见命名进决策卡（C9，指南层）**：域名、服务名、环境名、自停时长、窗口时长等所有者以后要看见或念出来的名字与参数默认 `BATCH_AT_GATE`，不由 worker 顺手定——写进 v2 AGENTS 模板第 ⑪ 条、Skill 驾驶手册与 Worker 合同。真实事故：一个按内部术语起的服务名让所有者连问四轮
- **环境事实（C10）**：`requires:` 新增 `probe:` 条目（shell 命令 + 可选 `expect` 正则 + `name`），启动前与二进制版本一起 fail-closed 核验；Work 目录 `env-facts.md` 约定（`overview` 显示 ✓）。真实事故：目标机 Python 3.6 / Redis <7 各烧一窗，同族缺陷第五次出现
- **Skill 才是入口（所有者 2026-09-02 指出）**：`SKILL.md` 新增 §0.5「v2 驾驶手册」——用户一句话 → 会话调哪条命令 → 回给用户什么；frontmatter 加 v2 触发词；新增 `templates/v2/AGENTS.md`（一页流程 + 视角路由 + 十一条规则 + 红线，蒸馏自试点工作区手写版）与 `templates/v2/指挥台.md`（日常六句话）。此前根目录 SKILL.md 与 plugin SKILL.md 里 v2 出现次数为零，会话装载到的仍是 v1 三域口径
- 测试：新增 `v2-liveness` / `v2-supersede` / `v2-gc` / `v2-notify` / `v2-envelope` / `v2-cache` / `v2-overview` / `v2-release-lane` 八组 19 项（含 CLI 端到端与本地 HTTP 接收端）
- **指南第 0 篇「怎么和会话说话」**：`docs/v2/guide/00-how-to-talk.md`——给用户看的一页，按项目阶段（未开始 → 立项定方案 → 准备执行 → 执行推进 → 验收合并 → 上线 → 完结换期复盘）列出你说什么、会话做什么、你得到什么；通用场景，不预设工具或第二个 agent
- **仓库脱敏**：公司名、本机路径、试点工作区/子仓/产品/服务名、内部 Work/Run 编号、远端平台名全部替换为通用试点标签（历史文档、发布证据、试点记录、源码注释一并处理）；两份试点文档改名。开源仓里任何文字都应"换个公司、换个工具、只有一个会话"仍成立
- 边界：编排器仍是同步 spawnSync（STALLED 通知由独立 `watch` 进程完成）；`release` 预设无 finding 门（车道里没有 reviewer，不设满足不了的规则）；钉钉通道只支持关键词模式

## v2.0.0-beta.3 — 2026-09-01

> 主题：三十轮部署战役（试点 WORK-PILOT-DEPLOY-01，DEPLOY-01~30 + L4 之夜）的机制回灌。战役复盘：`试点工作区的部署战役复盘文档`。
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.3` 已于 2026-09-01 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33460544343，双 job success）；`latest` 保持 v1.21.0。独立回读（直连 npmjs.org）：dist-tag 路由、integrity、签名+attestation、隔离安装全过，证据见 [`docs/V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md`](docs/V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md)。

- **发现分诊门**（复盘改革条 4）：run 配置 `reviewTriage: required` 后，review 的 P0/P1 finding 不再自动派 fixer——停 `WAITING_HUMAN`（kind `finding-triage`）待人逐指纹裁决，approve `enter-fix` 才放行。finding 是处方不是事实；自动路由处方在战役振荡期连烧四轮
- **锚定审查与裁决台账**（改革条 3）：finding 全部落 Git 面 `delivery/work/<id>/review-findings.jsonl`（指纹=严重度+正文规范化 hash）；`findings list` / `findings adjudicate --action accept|dismiss` 人裁决；`dismiss` 后同指纹不再阻断（重提记 `RE-RAISED` 可见）、严重度升级自动重开；Reviewer input 注入历史裁决锚（`anchor`）、fixer input 注入带裁决状态的工单（`findings`）。裁决记忆在 Git 面，删 runtime 不丢
- **环境契约 `requires:`**：run 配置声明信封依赖的二进制与最低版本，Run 启动前 fail-closed 全量核验、一次报清（真实事故：vendored-only `rg`、bash 3.2、新 shell 解析 Node 14 各烧整轮才见真因）；`doctor` 同步报告
- **review 轮数预算原生化**（改革条 1 的机制化）：官方预设 `budgets.maxAttempts.review: 2`——第三轮 review 启动前即停人批，无需 prompt 约束兜底
- **`preflight` 预检通道**：`preflight --config <cfg> --step <id>` 在主 checkout 干跑某步 worker 命令，分钟级打到首个失败边界再进 Run；无 worktree、无台账、零证据（横幅明示 dry signal；`BUILDBEAT_PREFLIGHT=1`），Run 必须复现才算数
- **fix(v2) 崩溃恢复不再误路由**：被中断的步现在重跑自身（丢失尝试仍计预算），不再按步骤失败走 failure 边——真实事故（deploy-18）：宿主超时杀掉 verify worker，crash 被路由去 fix，fixer 面对零 verifier 证据白烧一轮。交互式 shell 里 `start` 现在提示脱离启动（nohup/setsid）
- 战役期间已并入的内核修复一并随本版发布：预算守卫（final attempt 失败不再派 fix，deploy-14）、porcelain 状态列保护、runtime 证据引用仓库相对化、Node <20 清晰报错（各见对应 commit）
- 指南更新：验证金字塔警示与"真缺陷类清零即升层"（06）、分诊门与锚定审查（07）、环境契约与 review 预算（02）、崩溃重跑语义与启动纪律（10）

## v2.0.0-beta.2 — 2026-08-28

> 主题：meta 试点仓v2 迁移试点抓出的内核修复。
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.2` 已于 2026-08-28 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33175013599，双 job success）；`latest` 保持 v1.21.0。独立回读：dist-tag 路由、integrity、SLSA provenance、隔离安装全过，证据见 [`docs/V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md`](docs/V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md)。

- **fix(v2) 范围门中文路径误拦**：git `core.quotepath` 默认把非 ASCII 路径转义为带引号的八进制串，`listChangedPaths` 直接喂给 allowedPaths 前缀检查导致范围内中文文件被判越界（真实事故：试点工作区 `RUN-META-V2-01` 被 `pm/登录二期看板.md` 阻断）。读回改用 `core.quotepath=off`，中文路径永久回归进 `tests/v2-invariants.test.js`

## v2.0.0-beta.1 — 2026-08-28

> 主题：BuildBeat v2 首个 Beta——确定性内核 + Agent Loop Runtime。事件溯源台账（hash 链、损坏截断、终态压实进 Git 面）、Policy 门（8 算子三值逻辑、`UNVERIFIED` 永不当 PASS）、隔离 Workspace（push 物理封禁、`allowedPaths` 越界即停、Reviewer 只读快照强制）、Shell Adapter 厂商中立接任意 CLI Agent（codex 实证）、digest 绑定人批与 `APPROVAL_STALE`。MVP 承诺兑现：Build–Verify–Fix–Review 自动闭环，停在合并决定，带证据交人。
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.1` 已于 2026-08-28 经 GitHub Actions OIDC / Trusted Publishing 发布到 dist-tag `next`；`latest` 保持 v1.21.0，v1 CLI 与文件冻结随包分发（脚手架束钉 `v1.21`）。v2 入口为独立 bin `buildbeat-v2`。registry exact artifact、SLSA provenance、dist-tag 路由、隔离安装、签名审计均已独立回读，证据见 [`docs/V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md`](docs/V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md)。
> **试点证据**：self-host（RUN-SELF-001）+ 两个外部真实项目（pilot-backend RUN-PILOT-EXT-01 全自动 5.2 分钟到合并决定；pilot-app 看板积压含完整 reviewer 阻断→fixer 修复闭环），六退出指标全达标；见 `docs/v2/M4-*.md`。

- **observe v0**（RFC-0003 §8 冻结契约的实现）：drift-check/live-status 类探针接为 Evidence Provider（采不到即 `unverified`，同一 Evidence Contract 与链校验台账）；bands log→只读诊断→Intent 草稿三层分层响应；草稿只入队 Git 面绝不自动执行；`observe triage` 人分诊，`dismiss` 回调阈值防告警疲劳；分诊记忆活在 Git 面，runtime 可删（不变量 23 有测试）
- **文档十件套**（`docs/v2/guide/`）：快速开始 / Workflow / Policy / Adapter / Worker 合同 / Evidence / Approval / v1 迁移半天手工 runbook / 安全边界 / 故障恢复
- **`buildbeat-v2 metrics`**：本地只读六指标；行为 evals 九场景卡进 `npm test` 单入口
- **v1 迁移**：半天手工 runbook（不猜旧状态、单向迁移、禁止双写）；`legacy-four-gates` 风险预设保留 v1 四 Gate 完整形态
- **v1 冻结的两处诚实修正**（prepublish 门抓出）：manifest `cliVersion` 校验接受 prerelease（否则 v1 CLI 装在 beta 包里自坏）；`SCAFFOLD_VERSION` 钉死 `v1.21` 字面量、与包版本解耦——脚手架内容束未变，存量安装不应看到虚构的跨大版本升级
- **发布道**：publish workflow 增加 prerelease 通道（prerelease tag 只能从其发布分支的 origin tip 发、强制 dist-tag `next`、verify 回读 dist-tag 路由；stable 通道 main-only 原样），配对契约进 `tests/publish-workflow.test.js` 永久回归

## v1 系列（2026-06-10 ～ 2026-08-25）

v1 ～ v1.21.0 的条目原文见 [`CHANGELOG-v1.md`](https://github.com/HaiYangBG1/BuildBeat/blob/main/CHANGELOG-v1.md)（仅仓库内，不随 npm 包分发）。
