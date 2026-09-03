# BuildBeat 落地执行计划（v3：CLI 选择性解冻版）

> 文档状态：v1 历史执行基线（WP0.1–WP4.3 已全部完成收口；项目所有者已于 2026-08-27 拍板 `V2-D0=B`，新开发按 [`V2-PLAN.md`](V2-PLAN.md) 与 [`V2-ITERATION-01.md`](V2-ITERATION-01.md) 执行，决策见 [`V2-DECISIONS.md`](V2-DECISIONS.md)，v1 转入维护线）
> 基线日期：2026-08-24
> 上游文档：[`ROADMAP.md`](ROADMAP.md)（下称“演进书”）；竞品调研见 [`CLI-STRATEGY-2026-08.md`](CLI-STRATEGY-2026-08.md)
> 基线代码：`@haiyangbg/buildbeat@1.20.0`（npm 已验证发布，Git tag `v1.20.0`）；legacy `solobaton@1.16.3` 保留并已 deprecate
> 实施状态（更新于 2026-08-25）：**WP0.1–WP4.3 已完成**。Phase 0–3 合并为 `1.20.0`，未补造 v1.17/v1.18/v1.19 artifacts；canonical package/repository 已迁移为 `@haiyangbg/buildbeat` / `HaiYangBG1/BuildBeat`。真实 schema 2 `v1.16 → v1.20` 升级试点以 `a136ff6f33d5814d36593f85a3b9ec2f1e223827` 闭合；GitHub 改名、push、Trusted Publisher、受保护 tag、OIDC publish、registry/provenance/签名/隔离安装、GitHub Release 与 legacy deprecation 已逐项回读。真实项目边界见 [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md)，外部分发关闭证据见 [`WP4.3-RELEASE-EVIDENCE-2026-08-25.md`](WP4.3-RELEASE-EVIDENCE-2026-08-25.md)。
>
> **决策链（2026-08-24）**：
> ① 先拍板"CLI 全冻结于 v0 只读"；
> ② 经对 Spec Kit / OpenSpec / BMAD 官方能力的限定范围调研（结论：CLI 分发/更新有明确价值，命令面并不相同；所核对页面未记录三方合并），修订为**选择性解冻**；
> ③ 最终边界：解冻 **Wave 1（init/adopt 真写入）** 与 **Wave 2（机械 upgrade）**；三方合并、uninstall 引擎、CLI 命令面扩张（gate/adr/standards/check）**继续冻结**。
> 原待拍板决策 D1（双实现权威）按"bus-check 唯一同步权威"执行；D3（写入事实注入）的"哑脚手架 + AI 渲染"已通过旧名与 BuildBeat canonical 两轮真实目录本地 Git/Hook/hash 验证。WP2.8 Gate3、WP3.1–WP3.4、WP4.1–WP4.2 与真实版本增量 upgrade 试点均已完成。WP4.3 选择 scoped package + 新仓库名并合并首发 `1.20.0`，现已完成外部分发和独立回读；后续版本仍须重新执行 [`RELEASING.md`](RELEASING.md) 的可变远端检查。

---

## 0. CLI 边界（本计划的宪法条款）

### 0.1 解冻范围（仅此三件）

| 能力 | 形态 | 参考对象 |
|---|---|---|
| `init` 真写入 | 哑脚手架：拷模板 + 填确定项，剩余占位符**显式留给 AI 会话渲染**；写 manifest 基线 | Spec Kit `specify init` |
| `adopt` 真写入 | 同上，默认紧凑布局，面向存量项目 | Spec Kit existing-project `init --here` 思路 |
| `upgrade` 机械升级 | hash==基线 → 替换；被改过 → 停下报告 + `--force`；project-owned 永不碰；semver 门控 | Spec Kit `integration upgrade` + BMAD 门控 |

### 0.2 继续冻结（当前价值/成本不成立，或已有替代）

- **三方合并引擎**：官方对照范围内未见三方合并契约；`three-way-only` 策略降级为“冲突报告 + AI 会话语义合并”（这是限定范围的设计取舍，不外推为全市场结论）；
- **uninstall 引擎**：BuildBeat 当前以手册替代（managed 文件清单 + 手动删除指引）；Spec Kit 已有 hash 驱动的 integration uninstall，因此这里是本产品的阶段性范围选择，不宣称市场无人需要；
- **CLI 命令面扩张**：`gate/adr/standards` 在 BuildBeat 当前由 agent/Skill 承担；CLI 不复刻 bus 级检查，因为本项目已有无安装脚本权威。OpenSpec 选择 CLI validate 代表另一种架构，不作为其“没有脚本层”的推断依据；
- **中断恢复 journal**：以"写前要求 git 工作区干净"替代——git 即回滚安全网（Spec Kit 同款思路"commit before upgrade"）；
- **不内置模型、不调用模型 API、不加遥测**（演进书 §10.3 不变）。

### 0.3 冻结护栏（机器化两条）

1. **命令面锁定**：合法命令 = `doctor / init / adopt / upgrade / version`；`diff / uninstall` 保留名返回 `command_not_available`。测试断言 HELP 与命令集合。
2. **可选模板排除**：`src/constants.js` 新增 `OPTIONAL_TEMPLATE_PREFIXES = ["standards/", "pm/adr/"]`，`plannedFiles()` 过滤——standards/ADR 是可选文件，不进默认脚手架与升级计划；回归用例锁定 init 计划清单在新增可选模板前后一致。

### 0.4 语义分工（与市场公式对齐）

```
CLI     = 确定性脚手架 + 机械升级 + 只读体检（doctor）
脚本    = 执行同步检查的唯一权威（bus-check 及同目录脚本）
Skill   = 全部语义：占位符渲染、Bootstrap 提问、Adopt 摸底、Gate、ADR、standards 起草、冲突合并
用户产物（看板/决策/状态/契约/证据）= 任何 CLI 操作永不触碰
```

### 0.5 npm 发布策略

原规划的 v1.17–v1.20 分段目标没有形成远端 artifacts；当前将 Phase 0–3 合并为一个 `@haiyangbg/buildbeat@1.20.0` 候选，沿用 Trusted Publishing runbook，不补造空 tag/Release。已发布 `solobaton` 永久保留为 legacy read-only distribution ID，发布后只加迁移 deprecation，不 unpublish。BuildBeat 写入式第一屏命令使用 `npx --yes --package=@haiyangbg/buildbeat@latest buildbeat init my-project`，只有在 scoped registry、provenance、签名与隔离安装回读完成后才宣称可用。

---

## 1. 执行总览

| 阶段 | 对应演进书 | 目标发布 | 工作包 | 规模 |
|---|---|---|---|---|
| Phase 0 基线收敛 + 契约修订 | §11 Phase 0 | v1.17 | WP0.1–WP0.5 | 小（2–4 人日） |
| Phase 1 执行过程同步 | §6 / §11 Phase 1 | v1.18 | WP1.1–WP1.6 | 中（5–8 人日） |
| Phase 2 规范、Bootstrap、**Wave 1 写入**与 BuildBeat namespace | §7/§8/§11 Phase 2 | v1.19 | WP2.1–WP2.8 | 大（9–14 人日） |
| Phase 3 **Wave 2 升级** + Gate/多仓增强 | §11 Phase 3/4 修订 | v1.20 | WP3.1–WP3.4 | 中（8–12 人日） |
| Phase 4 稳定与外部分发收尾 | §11 Phase 5 | v1.20 scoped 首发 | WP4.1–WP4.3 | 小（3–4 人日） |

总量约 **27–41 人日**（全建方案 40–55；全冻结方案 20–30；本方案加回的 7–11 人日聚焦于有官方产品先例、且符合 BuildBeat 当前分发失败模式的子集；最终价值仍以本项目试点为准）。

硬性顺序约束：

1. **先规格后实现**：WP0.4 `docs/CHECKS.md` 先于 Phase 1 全部检查增强；WP0.2 契约修订先于 Wave 1/2 实现。
2. **先检查后模板**：Phase 1 脚本增强在前，Phase 2 新模板在后（演进书 §17 第 5 条）。
3. **每阶段 Skill-only 完整**：CLI 每个写能力必须有 SKILL/手动等价路径，每版发布验收。
4. **Wave 1 先于 Wave 2**：upgrade 依赖 init 写入的 manifest 基线。
5. BuildBeat 品牌已于 2026-08-25 拍板；本地 namespace 在 WP2.8 收口，远端仓库/npm 标识迁移仍是独立外部 Gate。

---

## 2. 基线事实（执行者开工必读，2026-08-24 实测）

- 代码：`src/` 约 1,345 行（cli 182 / constants 145 / doctor 251 / planner 166 / project 601），零第三方运行时依赖，Node 20+，ESM。
- 启动基线的 npm CLI v0：`doctor` / `init --dry-run` / `adopt --dry-run` / `version`，无写路径；当前工作区已由 WP2.4 叠加未发布的 Wave 1 写路径，见 §7。
- 可复用地基：`FILE_POLICIES` 四策略 + `filePolicy()` 已实现；manifest schema 1 校验完整（`validateManifest`，含路径逃逸/符号链接防御）；扫描边界 4 层/5,000 条目/不追符号链接；`planner.js` 已计算 operations + collisions。
- 启动基线的 `templates/` 为 AGENTS / CLAUDE（指针）/ ARCHITECTURE / SOLOBATON / 指挥台 / contracts/PROTOCOL / pm / 5 脚本 / gitignore.template / reviewer；当前候选已将 canonical marker 迁移为 `BUILDBEAT.md`，并新增 optional `standards/` 与 `pm/adr/`。旧 `SOLOBATON.md` 只在读取层兼容，不再由新骨架生成。
- `bus-check.sh` 当前候选已有：原远端/腐烂/幽灵 hash/线上/漂移能力，以及 Gate 四态、完成↔证据、作用域引用、五级 finding、显式 coverage、`--format=json`、conflict/error strict、STACK/多仓 join 与 limit/symlink/permission 边界报告；`verify-status.sh` 已提供 L3 机器行。WP1.6 已完成早期真实项目只读试点，但 WP3.2–WP3.4 新增语义仍只有 disposable fixture，不能从局部全绿外推为生产适配完成。
- 测试基线已扩为 fixture 双渲染：Node CLI/发布回归、Shell human+JSON、Skill-only、文档契约、pack 审计；精确计数以最近一次完整门禁输出为准。改 README/模板/检查语义必须同步 `tests/check_docs.py`、fixture、`docs/CHECKS.md` 与 `example/`。
- 发布：GitHub Actions Trusted Publishing（OIDC + provenance 回读）；npm README 不可变已由 `@latest` 方案解决；CHANGELOG 每版必写"拷出项目升级"。
- manifest schema 1 规定 `integrations.gitignore/hooks` 必须为 null → **Wave 1 需要 schema 2**。

---

## 3. 全局执行规则（每个 WP 通用完成口径）

1. `npm test`、`npm run test:scripts`、`npm run test:skill-only`、`npm run check:docs` 全绿；新检查项/新写路径必须有正反用例。
2. 新模板/占位符登记 `RENDER_REQUIRED_PLACEHOLDERS`，所有权在 `filePolicy()` 归类；可选模板同时登记 `OPTIONAL_TEMPLATE_PREFIXES`。
3. 模板改动同步 `example/`；文档改动同步 `tests/check_docs.py`。
4. CHANGELOG 增量条目 + "拷出项目升级"段落（按所有权分类说明）。
5. 不引入第三方运行时依赖；不引入账号/遥测/远程状态。
6. CLI 改动限于 §0.1 解冻范围 + 维护性修复；每个 CLI 写能力在 SKILL/文档中有手动等价路径。

---

## 4. 既定取舍记录

| 决策 | 结论 |
|---|---|
| 检查语义权威（原 D1） | bus-check 唯一同步权威，`docs/CHECKS.md` 为规格单点；CLI 不复刻 bus 检查；doctor 保持三级分级不迁移（五级仅用于 bus-check 输出，映射表进 CHECKS.md） |
| 三文件地位（原 D2） | 保留：`CLAUDE.md`=兼容桥、`指挥台.md`=给人的操作卡、`reviewer.md`=工具专属增量；归类写进 CHECKS.md |
| 写入事实来源（原 D3） | **哑脚手架模式**（调研支持、待本项目试点验证）：CLI 填确定项（项目名/日期/版本），语义占位符留给 AI 会话按 SKILL §8 渲染；废弃 plan.json 两段式设计 |
| 版本策略（原 D4） | Phase 0–3 走 v1.17–v1.20；BuildBeat 本地 namespace 并入当前候选，v2.0 只评估外部分发迁移与稳定性 |
| bus-check 机器输出（原 D5） | 内嵌 `--format=json`，五脚本清单不变，默认行为不变 |
| three-way-only 策略 | **降级**：AGENTS.md / BUILDBEAT.md / 指挥台.md 重分类为 replace-if-unmodified；被改过时输出冲突报告，语义合并交给 AI 会话对照新模板执行 |

---

## 5. Phase 0：基线收敛 + 契约修订（→ v1.17）

> **工作区候选状态：已完成。** WP0.1–WP0.5 的文档、定位、规格和测试地基已同步；`prepublishOnly`、Shell 语法检查与 `git diff --check` 已通过。本结论只证明当前 worktree 的静态/本地闭环，发布权限仍按 §0.5 冻结。

### WP0.1 规划书与调研入库 + 决策落盘

- [`ROADMAP.md`](ROADMAP.md) 文首加修订框：记录 CLI 选择性解冻决策 + 失效/修订条款清单（§3.2 改为“CLI 限定为脚手架与机械升级”；§10.2 命令清单缩减为五命令；§10.4 事务条款按哑脚手架修订；§11 Phase 2/3 与 §17 执行顺序同步修订；三方合并相关条款删除）。
- [`CLI-STRATEGY-2026-08.md`](CLI-STRATEGY-2026-08.md) 与本文随库，本文固定路径为 `docs/EXECUTION-PLAN.md`。
- `演进规划书参考的文档/` 不入库，ROADMAP 附录 A 改注存档说明。
- CHANGELOG Unreleased：产品方向收敛声明（团队层/Preset/emit 不做）+ CLI 边界决策声明。
- 验收：`check:docs` 链接检查过；README「继续阅读」挂三份文档。

### WP0.2 `docs/CLI.md` 契约修订（Wave 1/2 的规格前置）

- 状态行区分“已发布 CLI v0 只读”与“未发布 WP2.5 源码候选”；v1.19 仍只是待真实试点/发布的 scaffold 目标，机械升级属后续 v1.20 目标；
- 「Future write transaction」改写为 **scaffold 模式契约**：允许留占位符（明示由 agent 渲染），写前要求目标 git 工作区干净（有 .git 时），逐文件原子写 + 失败回删本次文件，manifest 最后写；
- 「Future upgrade and uninstall」改写：三方合并条款删除，替换为"hash 比对 + 冲突报告 + `--force`"模型；semver 门控（同 major 自动，跨 major 需 `--major`）；uninstall 改为手册章节（managed 文件清单来源 = manifest）；
- manifest schema 2 定义：`files`（policy + baselineSha256，合法值仅 `replace-if-unmodified / project-owned / merge-only`）+ `integrations.gitignore`（fragment 标记与 hash）+ `integrations.hooks`（保持 null，装钩仍走 SKILL §8.2 手动步骤）；schema 1 继续可读，并继续接受其历史 `three-way-only` 值；实现必须使用按 schema 分开的 policy 校验集合；
- 命令面锁定与 §0.3 护栏写入契约。
- 验收：契约与本计划 §0 完全一致；check_docs.py 相关断言同步。

### WP0.3 产品定位改写（中英一致）

- `README.md`/`README.en.md`：首屏换演进书 §0 新定位语；人数无关化；明确“Builder 按需求/工作包端到端负责，产品/全栈/测试是 AI 专业视角而非人类岗位接力”；CLI 段改为"脚手架 + 体检 + 机械升级，语义在 AI 会话"。
- `package.json`：description 换新定位；keywords 去 `solo-builder` 加 `delivery-protocol` 等。
- `SKILL.md` frontmatter + §0/§1/§2：定位更新，触发关键词全部保留；同步 `templates/AGENTS.md`、工作包看板/NOW/status/指挥台与 `example/` 的最小措辞，使既有三视角仍可复用，但不再建模成人类岗位流水线。
- `tests/check_docs.py` 同步断言。
- 验收：演进书 Phase 0 验收三条；全仓无矛盾定位残留。

### WP0.4 检查语义规格单点 `docs/CHECKS.md`

四块内容（服务对象 = bus-check 及同目录脚本这一个实现）：

1. **不变量登记表**：演进书 §6.4 八条编号 INV-1…8，逐条写判定规则、机器可验部分、只能 `unverified` 的部分、由哪个脚本段实现；
2. **finding code 命名空间**：`sync. / gate. / evidence. / contract. / ref. / stack. / standards. / adr.`；doctor 现有 code 族附录（标注三级分级不迁移）；
3. **五级分级定义**（`confirmed/warning/unverified/conflict/error`，演进书 §6.5）+ 与 doctor 三级的对照表；
4. **机器可解析令牌规格**：Gate 状态行（`Gate<1-4>: pending|passed|blocked|n/a`，n/a 必带 `理由:`，passed 建议带 `决策:`/`证据:`）；工作包 `**证据**:` 行；证据引用合法形态（路径存在/hash 可解析）。
- 附 D2 三文件归类。
- 验收：Phase 1 全部 WP 引用它，不自造格式。

### WP0.5 脚本测试 fixture 化骨架

- `tests/fixtures/` 约定（最小项目树 + `expected-findings.json`）；`test-scripts.sh` 增 fixture 驱动模式；`tests/skill-only.test.sh` 骨架（无 node 走通建骨架 → bus-check 干净）。
- 种子 fixture：`healthy-default/`、`broken-now-pointer/`。
- 验收：纳入测试入口全绿；tests/README.md 写规范。

**v1.17 发布候选**：拷出项目升级 = 零修改（纯文档与测试基建）。相关源码后来随 Phase 0–2 本地基线 `b062f25` 保全，但尚未打 tag/发布；进入真实发布仍需单独的稳定候选确认与 Trusted Publishing 回读。

---

## 6. Phase 1：执行过程同步（→ v1.18）

（与冻结版计划一致，CLI 零参与。）

> **工作区候选状态：WP1.1–WP1.6 已完成。** 源码、模板、规范、fixture 与三个只读项目投影均已闭环；这仍不是已安装项目迁移、外部 adapter/L4 验收或发布授权。
> **候选门禁（2026-08-24）**：Node `24/24`、Shell `109/109`、Skill-only、69 份 Markdown 契约检查、56 文件 pack 审计、ShellCheck、Bash 语法与 `git diff --check` 全部通过。

### WP1.1 同步协议文本固化（候选完成）

- `SKILL.md` 新增「执行同步」章：开工 7 步 / 执行中 5 守则 / 收工 7 步（演进书 §6.1–6.3），把原有三个仪式重组为当前四仪式叙述。
- `templates/AGENTS.md` 规则④扩为"开工 + 收工"双护栏，增量 ≤10 行；`templates/pm/status/README.md` 补收工核对点；`example/` 同步。

### WP1.2 看板模板机器可解析化（候选完成）

- 阶段门表按 CHECKS.md 令牌改造（Gate 四态，n/a 必带理由）；工作包加 `**证据**:` 行；同步 example 与占位符登记；CHANGELOG 给旧看板三行迁移手册（project-owned 不自动替换）。

### WP1.3 bus-check 增强（候选完成，本阶段最大单项）

新增四段检查 + `--format=json`（自有 schemaVersion 1，五级 level；默认人类输出与恒 exit 0 不变）：

| finding code | 级别 | 判定 |
|---|---|---|
| `gate.na_without_reason` | conflict | n/a 无理由 |
| `gate.pass_untraceable` | warning | passed 无决策/证据引用 |
| `gate.line_missing` | warning | 缺 Gate 状态行（旧看板→提示迁移，不拦） |
| `gate.invalid` | error | Gate 重复、状态非法或 canonical 行结构损坏 |
| `evidence.missing` | conflict | ✅ 工作包无证据行或引用无效 |
| `ref.broken` | conflict | NOW/看板/decisions 引用的 .md 不存在 |
| `sync.scan_truncated` | unverified | 作用域扫描达到边界，剩余范围不冒充已验证 |
| `sync.unverified` | unverified | 无法判定时统一显式输出 |

- `--strict` 拦截面扩为全部 conflict/error；test-scripts.sh 每 code 正反用例。

### WP1.4 verify-status 机器可读化（候选完成）

- 输出行级机器可读结果供 bus-check 汇总（`sync.l3_stale` / `sync.l3_unconfigured`）；未配置行为不变。

### WP1.5 fixture 扩充（候选完成）

- `board-done-no-evidence/`、`gate-na-no-reason/`、`ghost-hash/`、`stale-now/`、`scan-truncated/`；断言 JSON 输出与 expected 逐 code 一致。

### WP1.6 真实项目试点（候选完成，发布闸）

- `example/` + 一个活跃多仓项目（建议一个真实企业工作区工作区）+ 一个单仓项目；人工制造三类不一致验证检出；结论记 CHANGELOG。**不过不发。**
- 证据：[`PHASE1-PILOT-2026-08-24.md`](PHASE1-PILOT-2026-08-24.md)；全部在临时副本/共享 clone 中只读运行，三类源项目 Git 可见状态前后一致。

**v1.18 发布**：脚本属 replace-if-unmodified 可整文件替换；看板/NOW/status 只给迁移手册。

---

## 7. Phase 2：规范、Bootstrap 与 Wave 1 写入（→ v1.19）

> **工作区候选状态：Phase 2-A（WP2.1–WP2.3）与 Phase 2-B（WP2.4–WP2.8）已完成本地闭环；WP2.8 Gate3 已由用户确认关闭。** 可选模板、结构检查、ADR、Skill 契约、Wave 1 CLI 事务、STACK 只读漂移检查、浏览器扩展 UI 探测修复与 Claude plugin marketplace 打包已由本地源仓基线提交 `b062f25` 保全；未推送、未发布。
> **候选门禁（WP2.4，2026-08-25）**：Node `38/38`、Shell `146/146`、Skill-only、87 份 Markdown 契约检查、69 文件 pack dry-run、ShellCheck、Bash/Node 语法与 `git diff --check` 全部通过。
> **候选门禁（WP2.7 安全前置，2026-08-25）**：Node `38/38`、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、97 份 Markdown 契约检查、70 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint 与 `git diff --check` 全部通过。另以无 Claude CLI 分支验证 CI 会明确 SKIP 动态安装、保留 3 项静态断言。
> **候选门禁（WP2.7 真实目录最终收口，2026-08-25）**：Node `39/39`、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、98 份 Markdown 契约检查、71 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint 与 `git diff --check` 全部通过。三个目标 Git/Hook/hash 闸已闭合；该次提交前证据后来随 Phase 0–2 本地基线保全，仍未发布。
> **候选门禁（WP2.8 BuildBeat 本地迁移与真实目录回归，2026-08-25）**：源码侧 Node `41/41`、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、99 份 Markdown 契约检查、73 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 已通过；新真实目录的 init/adopt/Skill-only 也已完成 doctor、verify-status、离线 strict、Git/Hook 与 namespace 核查，详见 [PHASE2-BUILDBEAT-PILOT-2026-08-25.md](PHASE2-BUILDBEAT-PILOT-2026-08-25.md)。用户已确认 Gate3 并关闭 WP2.8；随后授权形成本地源仓基线 `b062f25`，远端改名与发布仍未授权。

### WP2.1 standards 模板四件套（候选完成）

- `templates/standards/` 已新增 STACK / CODE / REVIEW / DESIGN：统一 Optional / AI write boundary / Draft|Confirmed 三行声明、稳定 Rule ID；CODE 含 Secret/鉴权/数据/供应链安全底线，DESIGN 承接原 AGENTS §1.5 正文，AGENTS 已收缩为摘要+指针。
- `filePolicy()` 对六个 optional 文件保持 project-owned；占位符表完整登记；`OPTIONAL_TEMPLATE_PREFIXES = ["standards/", "pm/adr/"]` 由 `plannedFiles()` 过滤，未进入 `COMMON_REQUIRED_FILES`，Node 回归锁定两个布局都不计划它们。
- `bus-check` 已实现存在才检查：缺失零 finding；Draft → `standards.unconfirmed`；非法三行声明/Rule ID/Confirmed 占位符/本地引用 → `standards.invalid`。valid/Draft/invalid fixtures 覆盖 human+JSON+strict。

### WP2.2 ADR 机制（候选完成）

- `templates/pm/adr/` 已新增五判据 README 与七字段 `ADR-0000-template.md`；decisions.md 增加 ADR 索引口径，普通拍板仍留在单一台账。
- `bus-check` 检查唯一合法 Status（Proposed/Accepted/Rejected/Superseded）和 Superseded 目标存在、状态合法、无自指/循环的终止链；fixtures 覆盖合法、非法状态与坏替代链。
- 教学沙盘增加一条 Accepted ADR 及 decisions 索引，不将 ADR 建模为人员/审批管理。

### WP2.3 Skill 侧 Bootstrap/Adopt 扩展（候选完成）

- SKILL §8 自查表已增加技术栈事实，先在一屏确认中提供 STACK Draft 卡；optional 默认不落文件、不增加提问预算，用户选择启用才生成 Draft，识别 UI 才建议 DESIGN。
- 有事实确认无 UI/无部署时，按统一令牌起草 Gate2/Gate4 `n/a | 理由:`；无法确认则保持 pending，不猜测。
- §8.5 摸底报告已固定加入“历史债务与接管边界”：已确认债务、未验证范围、新地盘、只维护老地盘与明确不碰范围；现有 project-owned standards/ADR 只读保留，不用上游覆盖。

### WP2.4 Wave 1：`init`/`adopt` 真写入（本阶段最大单项）

> **工作区候选完成。** 下述命令、事务和 schema 已落源码并通过 disposable sandbox 正反回归；该结论不是 npm 分发、真实项目接管或发布证据。

**命令形态**：`buildbeat init|adopt [path] [--layout default|compact] [--dry-run] [--json] [--yes]`。`solobaton` 仅作为 legacy executable alias。无 `--dry-run` 时：打印计划 → 交互确认（`--yes` 跳过）→ 写入。

**写入内容**：

1. templates 全树（排除可选前缀）按 layout 映射落盘；
2. 确定性占位符填充：项目名（package.json → README 标题 → 目录名，复用 `inferProjectName`）、日期、`BUILDBEAT.md` 版本与布局行；紧凑布局同步把七份操作文档的 `scripts/` 引用渲染为 `pm/scripts/`；
3. **其余占位符保留**，收尾输出逐文件列出 + 指引"开 AI 会话按 SKILL §8 渲染"（doctor 的 `placeholder.remaining` 天然成为渲染完成度检查）；
4. `.gitignore` 走 merge-only：追加带标记注释的 owned fragment；
5. manifest schema 2 最后写入（全部落盘文件的 policy + baselineSha256；`integrations.gitignore` 记 fragment hash；`hooks` 保持 null——装钩仍走 SKILL §8.2 第 7 步手动路径）。

**fail-closed**：已安装/mixed/partial → 拒绝；碰撞 → 列出并拒绝（Wave 1 无 `--force`）；目标含 `.git` 且工作区脏 → 拒绝（git 即回滚安全网）；写入失败 → 回删本次创建文件，并把本次修改过的 `.gitignore` 精确恢复为写前字节。无独立 journal 只意味着不承诺进程被强杀后的自动续做，不能用来免除进程内回滚。

**实现落点**：新增 `src/writer.js`（渲染+原子写+回删）；`src/cli.js` 放开写分支；`OUTPUT_SCHEMA_VERSION` 1→2（init/adopt JSON 增 `writesPerformed`、`renderedPlaceholders`、`pendingPlaceholders` 字段；CHANGELOG 标注破坏性变更）；`validateManifest` 增 schema 2 分支（schema 1 继续可读并保留历史 policy 校验）；同批移除新计划中的 `FILE_POLICIES.THREE_WAY_ONLY`，将 AGENTS.md / BUILDBEAT.md / 指挥台.md 重归 `replace-if-unmodified`。不得把该策略迁移延后到 Wave 2。

**测试**：在干净的目标根 Git 仓写入后，doctor 除待渲染的 `placeholder.remaining` warning 外无 error；对不存在/无 Git 的新目录写入后诚实保留 `git.not_initialized`。已覆盖默认/紧凑 apply、非交互确认拒绝、取消零写、非空目录警告、已装拒绝、碰撞拒绝、脏/不可读 Git 拒绝、symlink 父路径与 ignore host 拒绝、gitignore 合并幂等与精确 hash、manifest schema 1/2 双读、占位符清单、可执行位、既有 ignore 逐字节恢复，以及新建目标回删。

**SKILL 同步**：§8/§8.5 更新为"有 CLI 可 `init` 落骨架 + AI 渲染占位符；无 CLI 手动拷贝仍完整支持"（Skill-only 等价路径保持第一等公民）。

### WP2.5 STACK 漂移检查（bash 侧，候选完成）

- `templates/standards/STACK.md` 新增唯一 `buildbeat-stack-baseline:v1` 注释块；Node constraint、lockfile kind 与 Docker FROM image 用重复键表达精确集合，确认不适用时用唯一 `n/a`，不从人类声明表猜值。
- `bus-check` 仅在 STACK 结构合法且 Confirmed 时进入比对；扫描协调根下普通文件的 `.nvmrc` / `package.json#engines.node`、6 种 Node lockfile 与 `Dockerfile*` FROM，生成 `stack.drift` conflict 或 `stack.unverified`，不回显原始配置值。
- 扫描默认上限 `BUS_STACK_MAX=200`；缺源、JSON/版本文件无法解析、Python 缺失、Docker build ARG 无法解开、权限/符号链接/截断边界全部保持 unverified；只报告，绝不改 STACK/配置。完整边界已冻结在 `CHECKS.md` §3.5。
- `stack-valid/`、`stack-conflict/`、`stack-unverified/` 同时覆盖 human/JSON/strict；Shell 回归由 146 条扩至 166 条。

### WP2.6 分发补强（候选完成）

- README（中英）第一屏已加入本地 Claude plugin 候选安装路径与合并后的 GitHub marketplace 路径；WP2.6 当时继续冻结 legacy npm 写入入口。最终入口已改为 scoped `npx --yes --package=@haiyangbg/buildbeat@latest buildbeat init my-project`，仍须等 `1.20.0` 官方 registry 回读后才宣称可用；
- Claude plugin marketplace 采用根 `.claude-plugin/marketplace.json` + `plugins/buildbeat/.claude-plugin/plugin.json`，插件版本独立从 `0.1.0` 起步。root `SKILL.md` 自动发现为 `/buildbeat:buildbeat`；templates/docs/example/lessons/changelog/license 以 marketplace 内相对符号链接保持仓库 SSOT，Claude 安装缓存负责解引用为自包含副本；顶层 `bin/` 不进入插件边界；
- `tests/plugin-marketplace.test.sh` 始终检查 manifest、链接、Skill 路由和 `bin/` 排除；检测到 Claude CLI 时再用隔离 config/cache 完成 strict validate → marketplace add → `buildbeat@buildbeat-plugins` install/list → 缓存同源/无链接/再 validate 的 7 项断言。CI 无 Claude 时明确 SKIP 动态部分；
- `check_docs.py`、CI、prepublishOnly、tests README 与 CHANGELOG 已同步。官方合同依据为 [marketplace guide](https://code.claude.com/docs/en/plugin-marketplaces) 和 [plugin reference](https://code.claude.com/docs/en/plugins-reference)。没有安装到真实用户配置，没有 tag、GitHub Release 或 npm publish。

### WP2.7 试点（发布闸）

- 一个全新项目走 `init` 真写 + Skill/手动初始化 Git + AI 渲染 + bus-check 干净；一个存量项目走 `adopt`；一个项目走 Skill-only 手动 Bootstrap 交叉验证（完成这些后 doctor 对三者全绿）。
- fixture：`standards-partial/` 已证明 CODE/REVIEW 部分存在时缺失 STACK/DESIGN 合法，Shell 回归由 166 增至 176；`stack-conflict/` 已在 WP2.5 提前闭环。
- 只读预检见 [`PHASE2-PILOT-PREFLIGHT-2026-08-25.md`](PHASE2-PILOT-PREFLIGHT-2026-08-25.md)：相邻 `../pilot-app` 为 partial 安装且 9 个碰撞，`../试点工作区` 为 dirty legacy v1.14 安装且 9 个碰撞，均不具备 Wave 1 adopt 写入资格。剩余三条真实路径须用户点名绝对路径并明确授权；不得用 disposable fixture 冒充真实试点。
- 用户已点名 `~/Downloads/solobaton测试/{1,2,3}`、`~/Downloads/tide_副本` 与 `~/Downloads/solobaton-skill测试`；dry-run、人工拒绝、init apply、adopt apply 和 Skill-only Bootstrap 均已按边界执行，详见 [`PHASE2-PILOT-2026-08-25.md`](PHASE2-PILOT-2026-08-25.md)。
- `1`/`2` 保持零条目；两个 CLI 目标 manifest 有效，三个实际骨架项目占位符清零，验证套件与离线 strict exit 0。Tide 原 83 文件聚合 SHA-256 与原 ignore 173 字节 SHA-256 前后一致。
- 真实 Tide 暴露浏览器扩展 UI 假阴性；源码已从 Manifest V2/V3 的 action/content/options 等信号识别 UI，重跑 Tide 得到 `hasUi=true` 并加入 Node 回归。
- 用户随后明确授权三个 apply 目标初始化根 Git、安装规范 pre-commit Hook 并各创建本地 evidence commit。三者均位于 `main`、各 2 个提交、clean、无 remote，Hook 与仓内规范脚本一致；最终 HEAD 为 init `eb27a88663701ea03de776e32b6a23c2d1e3ac28`、Tide `5b6aa726a1722226f9651a14bf0fb8fa36a5f9f6`、Skill-only `b63383db9e56f17495a8ccc8edcb81e7c9cf24f0`。
- 最终 doctor 三者均 `ok=true`：init/Tide 无 finding，Skill-only 只保留预期 `manifest.missing` warning；验证套件与离线 strict 均 exit 0。授权前的 `git.not_initialized` 是历史阶段证据，不再是当前 blocker。WP2.7 据此完成，但不激活 npm 写入入口。

### WP2.8 BuildBeat namespace 迁移（完成）

- canonical 产品/命令/Skill/plugin 统一为 `BuildBeat` / `buildbeat`；新骨架使用 `BUILDBEAT.md`、`.buildbeat/manifest.json`、BuildBeat `.gitignore` marker 与 `buildbeat-stack-baseline:v1`。
- 兼容读取保留 `SOLOBATON.md`、`.solobaton/manifest.json`、旧 `.gitignore` marker、`solobaton-stack-baseline:v1` 与 `solobaton` executable alias；新写入永不生成旧 namespace，双 manifest 或混合 marker 必须 fail-closed。
- 已发布 npm 包 `solobaton` 与当前 GitHub 仓库地址暂保留。未加 scope 的 `buildbeat` 包名已被其他项目占用；scoped package、远端改名、tag、Release 与 npm publish 都需独立决策和授权。
- 完成口径：Node/Shell/Skill-only/plugin/docs/pack 全门禁通过；旧试点报告明确标为历史兼容证据；另选真实目录完成 BuildBeat namespace 的 init/adopt/Skill-only 回归后，才允许进入发布 Gate。
- 新隔离根 `~/Downloads/buildbeat测试` 已完成 default init、Tide compact adopt 与 Skill-only 回归；三目标旧 namespace 引用为 0。用户已确认 Gate3 并关闭 WP2.8，最终关闭 HEAD 分别为 `4ea29a94a3a29fa905ae99662359ec561298135d`、`69d6e8358f7fda03225c090d99b5647cae152183`、`6b32c53e4fd750770690a0bbe796638314cb792a`；随后另行授权将 Phase 0–2 提交为本地源仓基线 `b062f25`，未推送、未发布。

**v1.19 发布**：standards 可选零动作；**init/adopt 真写为新增能力**，CHANGELOG 显式标注 JSON schema 2 与 manifest schema 2。

---

## 8. Phase 3：Wave 2 升级 + Gate/多仓增强（→ v1.20）

### WP3.1 Wave 2：`upgrade` 机械升级（源码与真实版本增量试点完成）

> **当前证据边界（2026-08-25）**：`src/upgrader.js`、CLI 命令面与升级回归已落地；真实 schema 2 Git 沙箱覆盖 default/compact、hash 冲突、force、版本门控、legacy/schema、gitignore、新增/删除、doctor 与事务回滚。package/bundle 已形成 `1.20.0` / `v1.20` 真实增量，并在专用 Git 分支把真实 `v1.16 / 1.16.3` schema 2 项目升级到新 bundle；见 [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md)。这仍不等于 registry 发布。
> **WP3.1 阶段门禁（2026-08-25）**：最初源码候选门禁为 Node `55/55`（CLI `50/50`）、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、99 份 Markdown 契约检查、74 文件 pack dry-run及全部静态检查；随后真实版本增量试点补齐 dry-run/apply、所有权、doctor、strict、up-to-date 与 clean/no-remote 证据。

**命令形态**：`buildbeat upgrade [path] [--dry-run] [--json] [--force] [--major]`；legacy `solobaton upgrade` 只作为兼容调用形态。

**前置**：manifest schema 2 存在，否则 blocked（legacy 项目按 BUILDBEAT.md 手册升级，或在确认后重走 adopt 建基线）；git 工作区必须干净。

**逻辑**（遍历 manifest files ⨯ 新模板）：

| 状态 | 动作 |
|---|---|
| hash(current)==baseline 且上游有新版 | 替换 + 更新基线 |
| current≠baseline（用户改过） | 列入冲突报告，不动；`--force` 全局强推（明示风险） |
| project-owned | 永不碰；输出迁移说明（来源 = 各版 CHANGELOG"拷出项目升级"段） |
| merge-only（.gitignore fragment） | 按记录更新 fragment |
| 上游新增 lifecycle-managed 模板文件 | 无碰撞则落盘并入 manifest |
| 上游新增 project-owned 模板文件 | 只给迁移说明/补丁候选，不自动落盘 |
| 上游删除的托管文件 | 报告，不自动删 |

- **semver 门控**：同 major 内自动；跨 major 需 `--major`（BMAD 模式）。
- 冲突报告附建议："开 AI 会话对照新模板做语义合并"（原 three-way 的替代解法）。
- 收尾：机械更新 BUILDBEAT.md 版本行 → 跑 doctor → 提示 bus-check。
- **policy 前置条件**：直接消费 Wave 1 已落地的三策略 schema 2；本阶段不得再次迁移 policy。schema 1 的历史 `three-way-only` 仅用于读取/诊断，不能直接进入机械升级。

**测试**：未改全替 / 改过停下 / 混合场景 / 跨 major 拒绝 / legacy 拒绝 / 脏工作区拒绝 / 新增与删除文件处理 / 升级后 doctor 回读绿。

**实现落点**：`src/upgrader.js` 负责只输出路径/policy/action/hash 的完整计划、schema 2/canonical namespace/Git/version 门控、唯一 `.gitignore` fragment 处理、写前 hash/absence 复核、manifest-last 原子事务与进程内回滚；`src/cli.js` 只新增白名单中的 `upgrade`，`diff/uninstall` 继续 `command_not_available`。未引入三方合并、journal、uninstall、模型调用、网络请求或更宽命令面。

**候选验收**：升级专属用例覆盖 equal no-op、clean replace、compact 映射、modified/missing conflict、force 边界、跨 major 与 downgrade、schema 1/missing/invalid/legacy、dirty Git、上游新增/删除、未登记碰撞、gitignore changed/duplicate marker、失败逐字节回滚与 option scope。真实版本增量试点需在后续明确的 scaffold version/template delta 上单独执行，并保留目标 Git 前后与 doctor/bus-check 证据。

### WP3.2 Gate/证据强关联（源码候选完成）

> **当前证据边界（2026-08-25）**：以下结论只来自当前本地源码与 disposable Git fixture。正向探测未命中不证明“无 UI”；决策行存在只证明仓内引用可解析，不证明人真实批准；证据路径合规只证明位置和文件可读，不证明证据内容或线上状态为真。

- 新增 `gate.na_inconsistent`：Gate2 为 `n/a` 且仓库存在 regular `standards/DESIGN.md`、`index.html`、已知 UI package key 或浏览器扩展 UI manifest 时发 warning；仅做正向探测，未命中不输出反向结论。
- passed Gate 只要填写 `决策:`，就必须使用 `pm/decisions.md:<正整数行号>` 并命中现存日期表格行；仅写台账文件名、越界行或非决策行均复用 `gate.pass_untraceable` warning。只填有效 `证据:` 仍保持合法。
- 新增 `evidence.outside_archive`：Gate/已完成工作包的有效本地证据不在 `pm/archive/<期>/evidence/` 时发 warning；hash/URL 没有本地位置语义，不套用该 finding。

**实现落点**：`templates/scripts/bus-check.sh` 共享同一 finding 集合渲染 human/JSON；`docs/CHECKS.md`、SKILL、看板模板与教学沙盘同步精确令牌。未扩 CLI 命令面，未自动改项目文件，warning 不改变既有 `--strict` 的 conflict/error 阻塞边界。

**候选验收**：新增 `gate-na-ui-inconsistent`、`gate-decision-valid`、`gate-decision-line-missing`、`evidence-outside-archive` 四组 fixture，并把既有 `evidence-valid` 迁到 canonical 归档路径。Node `55/55`、Shell `199/199`、Skill-only、Claude plugin `7/7`、106 份 Markdown 检查、74 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 均通过。

### WP3.3 多仓漂移（源码候选完成）

> **当前证据边界（2026-08-25）**：真实多仓项目只用于只读校准现存 CHANGELOG/契约形态，没有修改文件、调用线上适配器或据此判定一致。候选验收来自 runtime 生成的 disposable nested Git fixture；它证明解析、finding 与 strict 语义，不证明任何真实项目或部署当前一致。

- `contracts/PROTOCOL.md` 新增唯一 project-owned `buildbeat-multirepo-map:v1`：每行精确声明 `repo=<path>|contract=<contracts/*.md>|deployment=<bus-baseline app 或 n/a>`。map 同时是预期仓清单；已发现未登记、已登记未被一/二级 SUBREPOS 发现都显式 `sync.unverified`。
- 子仓版本只取根 `CHANGELOG.md` 第一个非 Unreleased H2；契约版本只取映射文件唯一「契约快照对应版本」反引号 token；部署版本只取脚本同目录 `bus-baseline.json#apps.<app>.imageTag`。接受两/三段数字版本及 SemVer 后缀，比较时只去掉一个前导 v/V；不猜 package、Git tag、commit、架构表或自由文本。
- 任意两个已成功观测的来源确定不一致即 `sync.multirepo_drift` conflict；第三源缺失可同时保留 `sync.unverified`。缺 jq/基线/app、非标准版本、缺 CHANGELOG、无效 map、symlink/越界均不冒充 drift 或全绿。

**实现落点**：沿现有 `SUBREPOS` 自动发现调用 `check_multirepo_drift`；human/JSON 共用 finding，报告包含 repo、精确文件和 `bus-baseline.json#apps.<app>.imageTag` 来源。`PROTOCOL.md` 继续 project-owned，机械 upgrade 不覆盖；现有项目按 CHANGELOG 手工加 map。

**候选验收**：`tests/test-scripts.sh` 在 mktemp 项目内运行时创建两个映射子仓和一个未登记子仓（含空格路径），覆盖三源一致 strict 0、部署版本确定冲突 strict 1、code/level/path/source 精确性与未登记仓 unverified；Shell 回归 `210/210`，Node `55/55`。

### WP3.4 边界报告完善（源码候选完成）

- `sync.scan_truncated` 统一表达机械覆盖边界，message 使用稳定 `reason=limit|symlink|permission`，`path` 尽量落到具体仓库相对来源；无法从文件系统遍历错误安全定位时只写 `.`，不泄露临时绝对路径或原始 OS 错误。
- 作用域引用与 STACK 扫描达到 `BUS_REF_MAX` / `BUS_STACK_MAX` 报 `limit`；NOW/看板/status/evidence/standards/ADR/STACK/多仓来源遇到根内 symlink 或权限不足时不跟随、不读取、不冒充缺失或全绿。领域语义可并列，如 STACK 同时给精确 `sync.scan_truncated` 与受影响维度 `stack.unverified`。
- 完成工作包的证据若只是 symlink 或不可读，保持非阻断 unverified，不额外误报 `evidence.missing`；真正缺失/越界/不安全引用仍走原有 `evidence.missing` / `ref.broken`。
- `SKILL.md` 与 `templates/指挥台.md` 新增“检查结果怎么读”：解释五级含义、strict 边界、`coverage.complete=false` 结论口径，以及 limit/symlink/permission、L3、Gate/evidence/ref、STACK/多仓 finding 的处置顺序。

**候选验收**：既有 `scan-truncated` fixture 补 `reason=limit`；runtime fixture 分别验证 symlink evidence 与 chmod `000` evidence 均 strict 0、`coverage.complete=false`、精确相对 path 且不误报 `evidence.missing`。真实多仓刷新又发现 scoped legacy prose 的根内 `../` 兼容缺口；修复后 Shell 回归 `222/222`，根外逃逸仍阻断。最终真实投影精确保留一个业务仓自身 `lessons.md` 断链 conflict、四仓未登记 map 和适配器/远端/live 未验证范围，未冒充全绿。

**v1.20 发布**：`bus-check.sh` 整文件替换即得增强；**upgrade 为新增能力**——本版起拷出项目升级从手册时代进入机械时代（有 manifest 的项目）。

---

## 9. Phase 4：稳定与外部分发收尾（→ v2.0 评估）

| WP | 内容 |
|---|---|
| WP4.1（完成） | `example/` 换新协议全貌（standards + ADR + Gate 四态 + 证据行 + manifest）；legacy 项目迁移指南一页（v1.16 拷出项目 → 新版协议 + 建基线路径） |
| WP4.2（完成） | 能力矩阵定稿（Skill-only ⟷ CLI 三命令）；双语文档终校；演进书 §15 硬门槛按修订后逐条打勾存档 |
| WP4.3（完成） | 已迁移到 `@haiyangbg/buildbeat` 与 `HaiYangBG1/BuildBeat`；legacy npm 包只读保留并加迁移提示；仓库重定向、Trusted Publishing、registry/provenance/签名/隔离安装与 Release 已独立回读 |

### WP4.1 示例全貌与 legacy 迁移（完成）

- `example/` 保留已完成一期的四个 `passed` live Gate，在 README 单独给出 `pending/passed/blocked/n/a` 四态语法，避免一份看板出现重复权威行；standards、ADR、完成工作包证据行与归档 evidence 继续作为已填完快照。
- 新增 `example/.buildbeat/manifest.json` schema 2 合成教学快照：8 个声明路径的 policy/hash 与当前字节由 `check_docs.py` 强关联；该文件明示不是已发布 v1.16 写入证据、健康 CLI 安装或可复制基线。scripts/指挥台/Hook 仍引用上游 SSOT，optional 与业务记录不进 manifest。
- `docs/LEGACY-V1.16-MIGRATION.md` 集中冻结两条路：默认继续按所有权手工维护；只在明确批准后于专用 Git 分支重走 `adopt` 建立真实 schema 2 基线。手写/复制/重命名 manifest、破坏性 reset、混合 namespace 和把基线当成 Gate/部署证据均被明确禁止。
- README 中英入口与 SKILL 接管仪式已链接该指南；本工作包不执行真实项目迁移、push、tag、Release、npm publish 或远端改名。

**候选验收**：Node `55/55`、Shell `221/221`、Skill-only、Claude plugin `7/7`、107 份 Markdown 契约检查、76 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过；该证据只覆盖本地源码/文档候选和一次性沙箱。

### WP4.2 能力矩阵、双语终校与硬门槛（完成）

- `docs/CAPABILITY-MATRIX.md` 把 CLI 命令面固定为检查 `doctor`、建骨架 `init/adopt`、机械升级 `upgrade` 三组；`version` 只是信息工具，`diff/uninstall` 仍保留不可用，工作流命令不进 CLI。矩阵逐项区分 Skill-only、legacy npm v0 和 scoped BuildBeat 1.20。
- `tests/skill-only.test.sh` 补齐双向互操作：Skill 手工项目可被 CLI `doctor` 保守识别并显式报 `manifest.missing`；CLI 真实 `init` 的一次性项目经 Skill 渲染后，屏蔽 Node/CLI 仍可运行项目本地 strict 检查。
- README 中英终校同步了 Phase 3 范围、三个可用面、示例边界和能力矩阵入口；真实试点补证后又同步 scoped 1.20 与源码/registry/项目三面边界；`check_docs.py` 锁定成对字段和零第三方 runtime dependency。
- `docs/PHASE4-STABILITY-AUDIT-2026-08-25.md` 最初按 11/12 归档；真实版本增量 upgrade、多仓刷新和兼容性修复完成后刷新为 12/12 源码/真实试点候选口径，外部分发仍独立开放。

**候选验收**：Node `55/55`、Shell `221/221`、Skill-only + CLI/Skill 双向互操作、Claude plugin `7/7`、109 份 Markdown 契约检查、78 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过。本次未重跑真实项目、未查询 npm/GitHub 可变远端状态，未执行任何外部动作。

### WP4.3 scoped 分发迁移（完成）

- 用户已拍板 canonical npm package=`@haiyangbg/buildbeat`、repository=`HaiYangBG1/BuildBeat`；unscoped `buildbeat` 已被其他项目占用，不冒用。
- 版本序列选择合并 `1.20.0`：Phase 0–3 的真实代码和文档一次交付，不补造从未发布的 v1.17/v1.18/v1.19 artifacts。
- package/workflow/plugin/docs 已切换 scoped identity；真实 `v1.16 → v1.20` schema 2 upgrade 与真实多仓刷新证据见 [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md)。
- 外部执行已按固定顺序完成：本地全门禁与候选提交 → GitHub 仓库改名并核规则/环境 → push/CI → scoped 包 bootstrap → 绑定 Trusted Publisher → 受保护 tag 驱动 `1.20.0` publish → registry/provenance/签名/隔离安装回读 → GitHub Release → legacy `solobaton` deprecation。精确身份和偏差记录见 [`WP4.3-RELEASE-EVIDENCE-2026-08-25.md`](WP4.3-RELEASE-EVIDENCE-2026-08-25.md)。

---

## 10. 测试矩阵落地映射

| 演进书 §13 维度 | 承载 | 建设时机 |
|---|---|---|
| 仅 Skill | `tests/skill-only.test.sh` | WP0.5 → WP2.7 完整 |
| Skill + CLI | init 写 + AI 渲染 + doctor 回读 + 屏蔽 CLI 继续维护 | WP2.7 / WP4.2 |
| 新项目 / 存量 | `healthy-default/` + `brownfield-compact/` | WP0.5 / WP2.7 |
| UI / 无 UI / 部署 | Gate n/a fixture 变体 | WP1.5 / WP2.7 |
| 单仓 / 多仓 | 多仓生成脚本 fixture | WP3.3 |
| standards 缺/部分/全/冲突 | `standards-partial/` `stack-conflict/` | WP2.7 |
| Gate 四态 | `gate-na-no-reason/` 等 | WP1.5 |
| STACK 漂移 | `stack-conflict/` | WP2.5 |
| 生命周期 clean/dirty/用户改写/跨 major/legacy | upgrade 用例组 | WP3.1 |
| 扫描边界 | `scan-truncated/` + 权限 fixture | WP1.5 / WP3.4 |

---

## 11. 发布与 CHANGELOG 义务

- 每版 = Phase 全部 WP + 试点/发布闸 + `prepublishOnly` 全绿 + Trusted Publishing 流程。
- CHANGELOG 每版必含：主题一句话；"拷出项目升级"段（按所有权分类；v1.20 起区分"有 manifest 走 `upgrade`"与"legacy 走手册"两条路径）；schema 破坏性变更显式标注（v1.19：输出 schema 2 + manifest schema 2）；真实试点结论（v1.18 起）。

---

## 12. 风险与回退

| 风险 | 触发点 | 缓解/回退 |
|---|---|---|
| 解冻范围蔓延（第四个写命令出现） | 任何阶段 | §0.1 白名单 + 命令面锁定测试；新增写能力必须重新立项 |
| 写入伤及用户文件 | WP2.4/WP3.1 | 脏工作区拒绝（git 即回滚网）+ 逐文件原子写 + 失败回删 + 碰撞 fail-closed + upgrade 默认只报告不强推 |
| 占位符残留被误当成品 | WP2.4 | init 收尾显式输出待渲染清单 + doctor `placeholder.remaining` 警告 + SKILL 渲染指引三处联动 |
| bus-check 单实现过度承诺 | WP1.3 起 | CHECKS.md 逐条标注可验边界；比不了的强制 `unverified`；`--strict` 只拦 conflict/error |
| 旧看板无令牌被误报 | v1.18 | `gate.line_missing` 只 warning；三行迁移手册 |
| legacy 项目无法机械升级 | v1.20 后 | 诚实 blocked + 手册路径 + Phase 4 迁移指南给建基线方案；不猜所有权 |
| 模板与 CLI 常量失配 | 模板 WP | `OPTIONAL_TEMPLATE_PREFIXES` + 计划清单锁定回归 |
| standards 官僚化回流 | v1.19 后 | 默认不生成 + 缺失零输出 + 提问预算不变 |
| 范围回流（成员/Owner/emit） | 任何阶段 | 演进书 §16.1 为需求评审否决清单 |

---

## 13. 当前状态与下一开工清单

1. [x] **Phase 0（WP0.1–WP0.5）**：基线、契约、定位、检查规格与回归地基完成。
2. [x] **Phase 1（WP1.1–WP1.6）**：执行同步、结构化 bus-check、L3 机器行、fixtures 与三个只读项目投影完成。
3. [x] **Phase 2-A（WP2.1 + WP2.2 + WP2.3）**：optional standards、ADR、结构化检查、Skill Bootstrap/Adopt 契约与教学沙盘已批量完成并形成稳定候选。
4. [x] **Phase 2-B / WP2.4**：Wave 1 `init/adopt` 真写、schema 2、碰撞/脏工作区/路径护栏、原子事务与进程内回滚已在一次性沙箱闭环。
5. [x] **Phase 2-B / WP2.5**：Confirmed STACK 的 Node/lockfile/Docker 可核对基线、只读扫描、drift/unverified 边界与三类 fixture 已闭环。
6. [x] **Phase 2-B / WP2.6**：Claude marketplace/plugin 打包、双语候选入口、隔离安装回归与文档/CI 门禁已闭环；npm 写入式首屏入口仍受 §0.5 发布闸约束。
7. [x] **发布序列决策**：Phase 0–3 合并为 `1.20.0` scoped 首发，不补造未发布的 v1.17/v1.18/v1.19 artifacts。
8. [x] **Phase 2-B / WP2.7**：三条真实目录写路径、语义渲染、Git/Hook/evidence commits、Tide 保护性摘要、离线 strict 与最终 doctor 已闭环；浏览器扩展 UI 探测假阴性已修。npm 发布另需单独授权。
9. [x] **Phase 2-B / WP2.8**：BuildBeat canonical namespace 的源码、模板、Skill、plugin、文档、本地全门禁与新真实目录 init/adopt/Skill-only 均已闭环；用户已确认 Gate3 并关闭 WP2.8。旧名 WP2.7 证据保持历史，不参与新 namespace 结论。
10. [x] **Phase 3 / WP3.1**：schema 2 机械 upgrade、semver/ownership/Git 门控、完整冲突报告、force 边界、manifest-last 事务、doctor 回读、disposable Git 沙箱与真实 `v1.16 → v1.20` 版本增量试点均已闭环。
11. [x] **Phase 3 / WP3.2 源码候选**：Gate2 n/a 与正向 UI 信号、passed 决策精确行、evidence 归档位置三个强关联规则及 fixtures 已闭环；warning 不扩张 strict 或 human Gate 权限。
12. [x] **Phase 3 / WP3.3**：显式多仓 map、CHANGELOG/契约/部署基线交叉比对、确定 drift conflict 与缺失范围 unverified 已由 runtime nested-Git fixture 和真实四子仓只读刷新闭环；真实项目尚无 map 时逐仓保持 unverified。
13. [x] **Phase 3 / WP3.4**：limit/symlink/permission 统一为精确 `sync.scan_truncated` unverified；真实刷新发现并修复根内 source-relative legacy link 误判，根外逃逸仍阻断，Shell 回归 `222/222`。
14. [x] **Phase 4 / WP4.1**：`example/` 已补齐四态语法与 schema 2 合成教学 manifest，v1.16 legacy 拷出项目的手工维护/受控建基线路径已集中成指南；未执行发布或真实项目升级。
15. [x] **Phase 4 / WP4.2**：Skill-only ↔ CLI 三组生命周期入口矩阵、双语终校、双向互操作回归和§15 硬门槛归档已闭合；真实升级补证后 12 条达到源码/试点候选口径。
16. [x] **Phase 4 / WP4.3 决策**：迁移到 `@haiyangbg/buildbeat` 与 `HaiYangBG1/BuildBeat`，合并首发 `1.20.0`，legacy `solobaton` 保留只读并 deprecate。
17. [x] **Phase 4 / WP4.3 外部执行**：远端改名/push、Trusted Publisher、受保护 `v1.20.0` tag、OIDC npm publish、registry/provenance/签名/隔离安装回读、GitHub Release 与 legacy deprecation 已完成；关闭证据见 [`WP4.3-RELEASE-EVIDENCE-2026-08-25.md`](WP4.3-RELEASE-EVIDENCE-2026-08-25.md)。

Phase 0–2 已由 `b062f25` 本地提交保全，WP3.1–WP3.4 分别由 `a378b2f`、`168dfd3`、`7f4cf08`、`f02686f` 形成后续源码候选，WP4.1/WP4.2 由 `5179e99` / `1887cf2` 保全。BuildBeat Wave 1、真实 v1.20 Wave 2 upgrade 试点与 WP4.3 外部分发均已完成；可变远端状态未来仍按发布 runbook 重新读回。

---

## 附：与演进书章节映射（v3 修订后）

| 演进书 | 本文 |
|---|---|
| §0/§1 定位 | WP0.3 |
| §2 设计原则 | §3 全局规则 + §4 取舍记录 |
| §3.2 CLI 状态 | §0 CLI 边界（覆盖原文） |
| §5 目标文件结构 | WP2.1/WP2.2 + D2 归类 |
| §6 执行同步 | Phase 1 全部 |
| §7 可选规范 | WP2.1/WP2.5 |
| §8 决策与 ADR | WP2.2 |
| §9 Gate 模型 | WP1.2/WP1.3/WP3.2 |
| §10 双路径 | §0 边界 + WP2.4/WP3.1（按哑脚手架/机械升级修订） |
| §11 路线图 | §1 执行总览 |
| §13 测试矩阵 | §10 |
| §14 风险 | §12 |
| §15 发布硬门槛 | §11 + 各版发布检查（写入相关条款按 §0 修订） |
| §16 删除/暂缓 | WP0.1 声明 + §12 范围回流行 |
| §17 执行清单 | §1 顺序约束 + §13 开工清单 |
