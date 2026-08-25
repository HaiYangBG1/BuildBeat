# Changelog

> 本项目吃自己的狗粮(红线④:必更 CHANGELOG)。格式循 Keep a Changelog,倒序。

## Unreleased

> **拷出项目升级**:在根 `AGENTS.md` 的任务包规则后补入「域回复格式」;未改过的 `指挥台.md` 可随后续版本机械替换。历史 status、看板和证据不回改,`pm/status/**` 持久口径不变。

- **域回复契约**:产品/全栈/测试等 AI 视角面向人收口时统一按「已做 → 未做 → 下一步」输出;已做只写功能/业务结果,证据紧跟对应事项,未做必须写原因,下一步明确交棒对象或真实求助
- **发挥边界**:回复契约只约束收口/交接,不要求中间进展和探索讨论套模板;本域仍能安全推进时继续做,不伪造求助或固定域流水线
- **多入口同步**:`SKILL.md`、`templates/AGENTS.md`、`指挥台.md`、中英 README、教学沙盘与文档回归检查同步新口径;Claude Code 插件版本升至 `0.2.1` 以刷新缓存;`lessons.md` 新增「域回复各说各话」失败模式
- **Node 23 macOS 测试兼容**:符号链接安全回归用 `unlinkSync` 删除符号链接,避免 `fs.rmSync` 在 Node 23.6 上误报 `ERR_FS_EISDIR`;不改运行时写入逻辑

## v1.20.0 — 2026-08-25

> 主题：把 Phase 0–3 合并为 BuildBeat 首个 scoped 正式版本，canonical 分发迁移到 `@haiyangbg/buildbeat` 与 `HaiYangBG1/BuildBeat`；旧 `solobaton` 包冻结为只读兼容入口。
> **拷出项目升级**：真实 schema 2 v1.16 安装可先运行 `buildbeat upgrade --dry-run`，无 blocker 后再机械升级到 v1.20；legacy/无 manifest 项目继续走手工迁移指南。`--force` 不覆盖 project-owned，项目 uninstall 仍不开放。
> **发布状态**：`@haiyangbg/buildbeat@1.20.0` 已通过 GitHub Actions OIDC / Trusted Publishing 发布；官方 registry exact artifact、SLSA provenance、签名、attestation、隔离安装、README 与 GitHub Release 均已独立回读。关闭证据见 [`docs/WP4.3-RELEASE-EVIDENCE-2026-08-25.md`](docs/WP4.3-RELEASE-EVIDENCE-2026-08-25.md)。

- **WP4.3 scoped 分发决策**：用户拍板立即迁移到 `@haiyangbg/buildbeat` 和 `HaiYangBG1/BuildBeat`；不冒用已被占用的 unscoped `buildbeat`。canonical executable 保持 `buildbeat`，`solobaton` 只保留包内兼容别名
- **版本序列合并**：未对外发布的 v1.17/v1.18/v1.19 不伪造成中间 artifact；当前 Phase 0–3 统一进入 `1.20.0`，scaffold version 从 v1.16 形成真实增量到 v1.20
- **legacy 包退场完成**：`solobaton@1.16.1`、`1.16.2`、`1.16.3` 已逐版本读回指向 `@haiyangbg/buildbeat` 的 deprecation 提示；未 unpublish，旧包不获得写入/upgrade 能力
- **Claude plugin 迁移**：仓库入口更新为 `HaiYangBG1/BuildBeat`，插件版本升至 `0.2.0` 以刷新分发缓存；npm CLI `bin/` 仍不进入插件包
- **真实 v1.20 升级试点**：在专用分支将真实 schema 2 项目从 scaffold `v1.16` / CLI `1.16.3` 升至 `v1.20` / `1.20.0`；默认 dry-run 对四个改写文件零写阻断，force 后人工回灌项目事实，project-owned 零 diff，doctor 0/0、strict exit 0、提交后 dry-run up-to-date，目标仓 clean 且无 remote
- **真实多仓刷新与兼容修复**：当前检查器在真实四子仓协调层投影中发现 legacy prose 根内 `../` 误判；现只对 scoped prose 允许 realpath 留在根内的 source-relative link，canonical Gate/evidence 仍禁 traversal，根外逃逸回归继续阻断。Shell 回归增至 `222/222`；最终刷新精确保留业务仓真实 `lessons.md` 断链、未登记 map 与适配器/远端/live unverified，不冒充全绿
- **Linux CI 可移植性**：JSON renderer 的 awk quote 正则改为 BSD awk / mawk 共通写法，避免 Linux stderr warning 污染机器 JSON；同时展开旧式 `A && B || C` Shell 断言并兼容 ShellCheck 0.9/0.11，macOS 与 Ubuntu 共用同一语义
- **品牌正式定名 BuildBeat**：2026-08-25 用户拍板产品名为 BuildBeat；canonical CLI/Skill/Claude plugin 标识统一为 `buildbeat` / `buildbeat@buildbeat-plugins`，新骨架入口改为 `BUILDBEAT.md`
- **canonical namespace 迁移**：新写入只生成 `.buildbeat/manifest.json`、BuildBeat `.gitignore` marker 与 `buildbeat-stack-baseline:v1`；doctor/bus-check 继续读取旧 `SOLOBATON.md`、`.solobaton/manifest.json`、marker 与 STACK 基线，双 manifest 或混合安装 fail-closed
- **legacy 分发兼容**：已发布 npm 包 `solobaton` 保留为 BuildBeat 的 legacy read-only distribution ID；新 scoped 包同时暴露 canonical `buildbeat` 与兼容 `solobaton` executable。未加 scope 的 `buildbeat` 包名已被其他项目占用，canonical package/repository 已迁移并完成远端回读
- **改名证据边界**：WP2.7 三条真实目录试点及其 hash 保持为 legacy namespace 历史证据；WP2.8 已用全新的隔离目录完成 BuildBeat canonical init/adopt/Skill-only 回归，二者不混写、不互相外推
- **新版方向与执行基线入库**：新增 `docs/ROADMAP.md`、`docs/EXECUTION-PLAN.md` 与官方来源可复核的 CLI 策略对照；产品方向由路线图承载，当前交付范围与依赖顺序由执行计划 v3 承载
- **CLI 选择性解冻决策**：未来只开放 `init/adopt` 哑脚手架写入与 manifest/hash 驱动的机械 `upgrade`；三方合并、项目 uninstall 引擎、`gate/adr/standards/check` 命令扩张继续冻结，语义渲染和冲突合并归 AI 会话/Skill
- **Wave 2 机械升级源码候选**：新增 schema-2-only `buildbeat upgrade [path] [--dry-run] [--json] [--force] [--major]`；同 major 按 manifest baseline/current/bundled template 三组 hash 做 replace/create/retain/report，跨 major 需显式确认，安装版本更新于 bundle 时拒绝降级
- **Wave 2 所有权与事务边界**：任一未解决冲突使整次 apply 零写；`--force` 仅可覆盖已登记的 `replace-if-unmodified` 或唯一 `.gitignore` owned fragment，永不触碰 project-owned、未登记碰撞、异常 marker、symlink/目录等不安全路径；写前复核 hash/absence，manifest 最后写，失败逐字节与 mode 回滚，成功后回读 doctor 并提示 bus-check
- **WP3.1 本地候选门禁**：Node `55/55`（其中 CLI `50/50`）、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、99 份 Markdown 契约检查、74 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过；这些是本地源码与 disposable sandbox 证据，不是 push、真实版本增量试点或发布证据
- **WP3.2 Gate/证据强关联**：`bus-check` 对正向 UI 信号与 Gate2 `n/a` 的矛盾新增 `gate.na_inconsistent` warning；passed Gate 的 `决策:` 必须精确指向 `pm/decisions.md:<行号>` 的现存日期表格行；有效本地证据不在 `pm/archive/<期>/evidence/` 时新增 `evidence.outside_archive` warning。未检出 UI 不外推为“无 UI”，两个 warning 均不冒充人工 Gate 结论或阻塞 strict
- **WP3.2 本地候选门禁**：Node `55/55`（其中 CLI `50/50`）、Shell `199/199`、Skill-only、Claude plugin 隔离安装 `7/7`、106 份 Markdown 契约检查、74 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过；新增 fixture 分别覆盖 UI/n-a 矛盾、有效/缺失决策行和归档内/外证据，证据仍限当前本地源码与 disposable Git 沙箱
- **WP3.3 多仓漂移**：`contracts/PROTOCOL.md` 新增 project-owned `buildbeat-multirepo-map:v1`，显式逐仓绑定子仓路径、契约版本文件与 `bus-baseline.json` app；`bus-check` 只核对首个非 Unreleased CHANGELOG H2、唯一契约快照版本和本地部署基线 imageTag。任意两个已观测来源确定不一致进入 `sync.multirepo_drift` conflict；缺 map/仓/来源/jq/基线、非标准版本或越界保留 `sync.unverified`，symlink/权限边界由后续 WP3.4 统一为 `sync.scan_truncated`
- **WP3.3 迁移边界**：`bus-check.sh` 可整文件替换获得检查，但 `PROTOCOL.md` 是 project-owned，现有多仓项目须人工加入 map；未配置只增加非阻断 unverified，绝不猜架构表、package version、Git tag、自由文本或线上状态。当前真实多仓文件仅用于只读校准格式，没有修改项目、运行线上查询或形成真实项目通过证据
- **WP3.3 本地候选门禁**：Node `55/55`（其中 CLI `50/50`）、Shell `210/210`、Skill-only、Claude plugin 隔离安装 `7/7`、106 份 Markdown 契约检查、74 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过；runtime fixture 临时创建带空格路径的内嵌 Git 仓，覆盖三源一致、确定漂移、精确 source/path 与未登记仓 unverified
- **WP3.4 扫描边界**：机械扫描因阈值、根内 symlink 或权限不足未覆盖时统一进入非阻断 `sync.scan_truncated`，message 携带稳定 `reason=limit|symlink|permission`，finding path 指向已知的仓库相对来源；NOW/看板/status/evidence/standards/ADR/STACK/多仓来源不跟随 symlink、不读取无权限文件，也不把未读误报为不存在或一致
- **WP3.4 结果处置与本地门禁**：`SKILL.md` 与 `指挥台.md` 新增五级 finding、strict/coverage 边界和常见处置页；runtime 回归证明 limit、symlink evidence 与 chmod `000` evidence 均保持 coverage unverified、strict 0、精确 path，且后两者不误报 `evidence.missing`。Node `55/55`（其中 CLI `50/50`）、Shell `221/221`、Skill-only、Claude plugin 隔离安装 `7/7`、106 份 Markdown 契约检查、74 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过
- **WP4.1 新协议教学全貌**：`example/` 在保留已完成一期四个 `passed` live Gate 的同时，单独给出 `pending/passed/blocked/n/a` 四态语法；新增 schema 2 合成教学 manifest，由文档检查精确锁定 8 个声明路径的 policy 和当前字节 hash。该 manifest 明示不是已发布 v1.16 写入证据、健康 CLI 安装或真实项目可复制基线
- **WP4.1 legacy 迁移边界**：新增 `docs/LEGACY-V1.16-MIGRATION.md`，默认路径是按所有权继续手工维护；只在明确批准后才可于专用 Git 分支移出旧冲突路径、重走当前源码候选 `adopt`、回灌 project-owned 事实并审查合并。手写/复制/重命名 manifest、混合 namespace、破坏性 reset 和把基线当成 Gate/部署证据均禁止
- **WP4.1 本地门禁**：Node `55/55`（其中 CLI `50/50`）、Shell `221/221`、Skill-only、Claude plugin 隔离安装 `7/7`、107 份 Markdown 契约检查、76 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过；未执行真实项目迁移、push、tag、GitHub Release、npm publish 或远端改名
- **WP4.2 能力矩阵与双语终校**：新增 `docs/CAPABILITY-MATRIX.md`，把可用面固定为检查 `doctor`、脚手架 `init/adopt`、机械升级 `upgrade` 三组生命周期入口，并逐项区分 Skill-only、已发布 `solobaton@1.16.3` 只读 v0 与当前本地源码候选；中英 README 同步 Phase 3 范围、真实试点缺口、示例边界和能力矩阵入口
- **WP4.2 双向互操作**：Skill-only 手工项目可由源码 CLI `doctor` 保守识别并明确返回 `manifest.missing`；CLI 真实 `init` 的一次性项目经 Skill 渲染后，在屏蔽 Node/CLI 的环境中仍可运行项目本地 strict 检查。该回归只证明结构兼容，不把沙箱结果外推为真实项目升级或 npm 可用性
- **WP4.2 硬门槛归档与本地门禁**：`docs/PHASE4-STABILITY-AUDIT-2026-08-25.md` 对演进书§15 逐条归档，12 条中 11 条达到本地源码候选口径；第 11 条仍缺真实版本增量 upgrade 和 WP3.3/WP3.4 真实环境刷新。Node `55/55`、Shell `221/221`、Skill-only + CLI/Skill 双向互操作、Claude plugin `7/7`、109 份 Markdown 契约检查、78 文件 pack dry-run及全部静态检查通过；未查询 npm/GitHub 可变远端状态，未执行 push、tag、Release、publish、部署或远端改名
- **仓库安全基线**：新增 npm/GitHub Actions Dependabot 周检、JavaScript/TypeScript CodeQL、SECURITY/贡献/行为规范、CODEOWNERS、Issue/PR 模板；CI 中第三方 Action 改为不可变完整 commit SHA
- **发布引用保护**：GitHub 服务端 `Protect release tags` ruleset 覆盖 `refs/tags/v*`，禁止更新和删除已创建的发布 tag，且无绕过角色；发布 runbook 增加回读步骤
- **CLI v0 真实试点**：使用官方 npm registry 的 `solobaton@1.16.3` 对三个存量项目运行只读 `doctor` 和 `adopt --dry-run`；Git 可见状态前后一致，并正确区分未安装、旧版已安装和部分安装状态
- **真实 scoped 发布验收**：`@haiyangbg/buildbeat@1.20.0` 已由 `v1.20.0@5aaa9e8` 和 workflow run `32826832379` 保全；registry `latest=1.20.0`、exact integrity、SLSA v1 provenance、registry signature、attestation、隔离安装及 GitHub Release 全绿。legacy `solobaton@1.16.3` 仍对所有项目写入 fail-closed
- **产品扩张边界**：多人账号/权限/组织管理和遥测/效能评分/指标仪表盘明确为当前非目标；CLI 不采集或上传项目使用数据，未来若扩展须独立立项并审查数据口径、隐私和权限治理
- **不变量与输出合同落地**：`docs/CHECKS.md` 冻结八条文件总线不变量、Gate/证据令牌、五级结论、finding code 命名空间、JSON 外形和严格模式退出语义；`bus-check --format=json` 已由同一 finding 集合渲染，默认人类报告保持 exit 0，strict 只拦 `conflict/error`
- **Phase 1 执行同步**：`SKILL.md` 与 AGENTS/status 模板固化开工 7 步、执行中 5 守则、收工 7 步；看板模板和教学沙盘新增四行 canonical Gate 状态与完成工作包 `**证据**:` 令牌
- **Phase 1 检查实现**：`bus-check` 新增 Gate、完成证据、作用域引用、扫描截断和显式 coverage 检查；`verify-status --format=machine` 返回 `sync.l3_stale` / `sync.l3_unconfigured`，`verify-status --run` 在任一真实套件失败时非零退出，warning/unverified 保持可见但不冒充绿灯
- **Phase 1 fixture 闭环**：健康、坏指针、无证据完成、Gate n/a 无理由、passed 不可追溯、非法 Gate、有效证据、幽灵 hash、陈旧看板和扫描截断场景逐项核对 JSON code/level/count/coverage/path 与 strict 退出码
- **Phase 1 只读试点**：example 的 11 个教学假 hash 全部被拦；活跃多仓投影稳定暴露 4 个 NOW 引用迁移项、4 条 legacy Gate warning 与旧 verify 机器协议缺口；真实单仓代码树投影基线 strict 通过，注入无证据完成/n-a 无理由/幽灵 hash 后分别命中唯一目标 conflict。三类源项目试点前后 Git 可见状态一致；详见 `docs/PHASE1-PILOT-2026-08-24.md`
- **Phase 2-A 可选规范**：新增 project-owned 的 STACK/CODE/REVIEW/DESIGN 模板与教学沙盘完成态；三行声明、稳定 Rule ID、CODE 安全底线和 UI-only DESIGN 契约已冻结。`OPTIONAL_TEMPLATE_PREFIXES` 确保默认 CLI 计划和 Skill-only 骨架不生成它们；缺失零 finding，Draft 显式 `unverified`，结构损坏进入 strict
- **Phase 2-A ADR**：新增五判据 README、七字段 ADR 模板和 decisions 索引口径；`bus-check` 校验四种 Status 与 Superseded 终止链，能拦缺失目标、自指、循环和非法目标状态；ADR 仍只记录长期技术决定，不承载成员或审批管理
- **Phase 2-A Bootstrap/Adopt 契约**：技术栈事实先形成一屏 STACK Draft 卡，可选规范默认不落文件且不增加提问预算；只有 UI 项目建议 DESIGN；确认无 UI/无部署时生成 canonical Gate2/Gate4 n/a 理由草案。存量摸底固定区分已确认历史债务、未验证范围、新地盘、只维护老地盘和明确不碰边界
- **Phase 2-A 历史收口边界**：Phase 2-A 稳定候选当时仍只接受 `init/adopt --dry-run`；该结论用于标记批次边界，不再描述后续叠加了 WP2.4–WP2.5 的当前工作区
- **Phase 2-B Wave 1 源码候选**：`init/adopt` 已实现“完整计划 → 交互确认或显式 `--yes` → 受控写入”；默认/紧凑布局均排除 optional standards/ADR，并只渲染项目名、日期、骨架版本、布局与紧凑脚本路径，剩余语义占位符结构化返回给 Skill
- **Phase 2-B STACK 漂移候选**：Confirmed STACK 新增 `buildbeat-stack-baseline:v1` 精确集合并只读兼容旧 `solobaton-stack-baseline:v1`；`bus-check` 比对 `.nvmrc` / `package.json#engines.node`、npm/pnpm/yarn/bun lockfile 种类与 Dockerfile FROM，确定矛盾进 `stack.drift` conflict，缺源/解析/权限/符号链接/截断边界进 `stack.unverified`；不猜自然语言、不回显原始值、不修改项目文件，matching/conflict/unverified 三类 fixture 已将 Shell 回归扩至 `166/166`
- **Phase 2-B Claude 插件分发候选**：新增 `buildbeat-plugins` marketplace 与独立 `buildbeat` 插件 `0.1.0`；插件以 marketplace 内相对符号链接复用 canonical SKILL/templates/docs/example，安装缓存解引用为自包含副本，并刻意排除 npm CLI 顶层 `bin/`。隔离配置回归覆盖严格校验、marketplace 添加、插件安装/启用、缓存同源与二次校验；CI 无 Claude CLI 时只证明静态打包，不冒充安装证据
- **分发入口证据边界**：中英 README 首屏加入 Claude plugin 与 scoped npm 路径；legacy `solobaton@latest` 不再承载写入入口，`npx --yes --package=@haiyangbg/buildbeat@latest buildbeat init my-project` 只有在 scoped artifact 完成官方 registry 回读后才宣称可用
- **WP2.7 安全前置**：新增 `standards-partial` fixture，证明仅启用 Confirmed CODE/REVIEW 时缺失 STACK/DESIGN 合法，Shell 回归增至 `176/176`；只读 dry-run 排除 partial 且碰撞的 `chickAI` 与 dirty legacy 安装的 `底座` 作为 Wave 1 adopt 目标
- **WP2.7 真实目录本地写入**：获用户点名后，分别保留 init dry-run 零写、交互拒绝零写、default init apply、Tide compact adopt 与 Skill-only 手动 Bootstrap 证据；三个实际骨架完成项目语义渲染，验证套件及离线 `bus-check --strict` exit 0，可选 standards/ADR 均未被为了全绿而生成
- **存量保护证据**：Tide 接管前后原 83 个文件的聚合 SHA-256 完全一致；剥离唯一 managed fragment 后，原 `.gitignore` 的 173 字节与 SHA-256 完全一致。没有运行构建、浏览器加载、发布或部署，静态保护证据不得外推为业务验证
- **浏览器扩展 UI 探测修复**：真实 Tide 试点暴露 `hasUi=false` 假阴性；项目扫描现在解析嵌套 Manifest V2/V3 的 action/content/options 等 UI 信号，Tide 重探测为 `hasUi=true`，并加入不依赖 `index.html` 或前端框架包的 Node 回归
- **WP2.7 Git 证据闭环**：获明确授权后，三个 apply 目标均初始化 `main`、安装与仓内规范脚本一致的 pre-commit Hook，并各形成 baseline + evidence 两个仅本地提交；最终 HEAD 为 `eb27a88663701ea03de776e32b6a23c2d1e3ac28`、`5b6aa726a1722226f9651a14bf0fb8fa36a5f9f6`、`b63383db9e56f17495a8ccc8edcb81e7c9cf24f0`，均 clean、无 remote。最终 doctor 均 `ok=true`，Skill-only 只保留预期 `manifest.missing`；不自动授权上游源码 commit、tag、GitHub Release、npm publish 或首屏写入入口激活
- **WP2.7 候选门禁**：真实试点反馈回灌后 Node `39/39`、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、98 份 Markdown 检查、71 文件 pack dry-run 与全部静态检查通过；该次结果是提交前 worktree 证据，后来随 Phase 0–2 本地基线一并保全，仍不是发布证据
- **WP2.8 本地迁移门禁**：BuildBeat namespace 改名与新试点证据回写后 Node `41/41`、Shell `176/176`、Skill-only、Claude plugin 隔离安装 `7/7`、99 份 Markdown 检查、73 文件 pack dry-run、ShellCheck、Bash/Node 语法、actionlint、gitleaks 与 `git diff --check` 全部通过；该次结果是提交前本地候选证据，后来随 Phase 0–2 本地基线一并保全，不是发布证据
- **WP2.8 BuildBeat 真实目录关闭**：新隔离根完成 default init、Tide compact adopt 与 Skill-only；doctor/verify-status/离线 strict、canonical namespace、Git/Hook/clean/no-remote 全部闭合，Tide 原 76 文件逐字节复核 0 差异。用户已确认 Gate3 并关闭 WP2.8，最终关闭 HEAD 为 `4ea29a94a3a29fa905ae99662359ec561298135d`、`69d6e8358f7fda03225c090d99b5647cae152183`、`6b32c53e4fd750770690a0bbe796638314cb792a`；随后另行授权形成 Phase 0–2 本地源仓基线 `b062f25`，未推送、未发布
- **Wave 1 fail-closed 事务**：每个目标文件经同文件系统临时 sibling、fsync 与原子 rename 落盘；碰撞、符号链接父路径、已有/partial/mixed 安装、dirty/unavailable 根 Git 状态、异常 `.gitignore` marker 全部写前拒绝；任一步失败回删本次文件/空目录并逐字节恢复既有 `.gitignore`
- **manifest/output schema 2（破坏性输出变更）**：CLI JSON envelope 从 schema 1 升为 2，新增实际写入路径、manifest、确定性替换和待渲染清单；新 manifest schema 2 最后写入，记录基线 SHA-256 与固定 `.gitignore` owned fragment，拒绝 `three-way-only`，同时 doctor 继续读取历史 schema 1
- **所有权策略迁移**：AGENTS.md / BUILDBEAT.md / 指挥台.md 的新计划由历史 `three-way-only` 改为 `replace-if-unmodified`；历史 schema 1 仍可回读旧 `SOLOBATON.md` 与该旧策略，当前 schema 2 永不生成它
- **Wave 1 证据边界**：Node 回归覆盖新目录/干净 Git/存量紧凑布局、无 Git 的诚实 `git.not_initialized`、确认取消、碰撞、dirty Git、ignore 幂等/hash、schema 双读、符号链接拒绝和注入失败回滚；WP2.7 另完成三条真实目录本地试点与 Git/Hook/hash 闭环，但没有上游 tag、GitHub Release 或 npm publish
- **端到端 Builder 模型对齐**：`SKILL.md`、模板、示例和中英 README 统一为“按需求/功能工作包并行，单个 Builder 端到端负责产品判断、实现、测试与交付证据”；产品/全栈/测试保留为 AI 专业视角，不建人类角色接力或团队管理层
- **Phase 0 回归地基**：新增健康/坏指针项目夹具和 `expected-findings.json` 过渡合同，并增加无 Node、无 CLI manifest 的 Skill-only 脚手架回归；两条 Shell 套件纳入 `prepublishOnly`，但未授权 v1.17 tag、GitHub Release 或 npm 发布

> **拷出项目升级（v1.20 已验证发布）**：
> 1. 若 `scripts/bus-check.sh` 未被项目修改，可整文件替换；紧凑布局替换 `pm/scripts/bus-check.sh`。
> 2. `verify-status.sh` 属 project-owned：保留现有 `SUITES`，仅人工合并 `--format=machine` 与 L3 新鲜度逻辑，不整文件覆盖。
> 3. 旧看板人工补 Gate1–Gate4 四行；每个 `✅完成` 工作包补恰好一行 `**证据**:`；NOW/看板的新机器引用改用仓库根相对路径（不用 `../`），并按需把开工/收工核对措辞合入 AGENTS/status 约定。
> 4. optional standards 与 ADR 不自动迁移：项目未启用就保持缺失；要启用时只复制选中的 project-owned 模板，填完项目事实后从 Draft 经人工确认改为 Confirmed，已有同名文件绝不覆盖。新 Confirmed STACK 使用 `buildbeat-stack-baseline:v1`；旧 `solobaton-stack-baseline:v1` 仅为读取兼容，缺基线时诚实显示 `stack.unverified`。
> 5. 已有 decisions.md 只补一行 ADR 索引口径；只有命中五项长期技术判据的决定才新建 ADR，历史普通拍板不追补、不拆表。
> 6. WP2.4 是新增安装能力，不自动改动任何已拷出项目；legacy 项目继续按上述所有权分类手动迁移。新的 `init/adopt` 只产生 `.buildbeat/manifest.json`；旧项目不得仅靠重命名 marker 伪造受管基线。
> 7. 品牌迁移不自动改写已拷出项目。保留旧 namespace 可继续只读兼容；若要迁移到 `BUILDBEAT.md` / `.buildbeat`，必须先做备份、ownership 核对和独立 dry-run，不同时保留两份 manifest。

## v1.16.3 — 2026-08-23

> 主题:修复 npm 上不可变 README 的执行命令永久落后一版的发布闭环。脚手架版本仍是 v1.16，CLI 命令边界不变，项目写入/升级/卸载仍未开放。
> **拷出项目升级**:业务模板和已拷出项目零修改；本补丁只修复 npm 分发文档与机器检查。

- **npm 落地页不再过期**:中英 README 与 CLI 合同的可执行示例改用 `solobaton@latest`；同一份文件在发布前指向 registry 已有版本，发布后自然指向新版，不再因 tarball 不可变而永久落后
- **可复现语义保留**:需要固定执行时先用 `npm view solobaton@latest version` 记录精确版本，再用该版本替换 `@latest`；精确 tag、commit、integrity 和 provenance 证据仍留在发布 runbook 与 GitHub Release
- **防回归机器闸**:文档检查强制三份分发文档同时包含 `@latest` 执行入口和精确版本解析命令，并拒绝任何硬编码 semver 的 `npx`/全局安装命令
- **候选证据边界**:`package.json` 与 manifest 已表达 `1.16.3` 候选，但在对应 annotated tag、OIDC 发布、registry/provenance/签名/隔离安装回读全绿前，已独立验证分发版仍是 `1.16.2`
- **真实发布验收**:`solobaton@1.16.3` 已通过 GitHub OIDC 发布，官方 registry `latest`/精确 tarball/SLSA v1 provenance/registry signature/attestation/隔离安装/只读 `doctor`/registry README 独立回读全部通过；精确发布物由 `v1.16.3@821ea3e` 保全，并已创建匹配的 GitHub Release

## v1.16.2 — 2026-08-22

> 主题:把 Trusted Publishing 从“已配置”推进到可实发验收的证据链。脚手架版本仍是 v1.16，CLI 命令边界不变，项目写入/升级/卸载仍未开放。
> **拷出项目升级**:业务模板和已拷出项目零修改；本补丁只加固 npm 包的发布与供应链验证。

- **npm 发布去长期 token**:新增手动触发的 GitHub Actions Trusted Publishing 工作流；发布 job 仅授予 `contents: read`、`id-token: write`，不读取 `NODE_AUTH_TOKEN` 或 `NPM_TOKEN`
- **发布源收紧**:只接受三段式 annotated tag；发布时 tag 目标、checkout `HEAD`、`GITHUB_SHA` 与远端 `main` HEAD 必须四者全等，不允许从旧 tag 或非 `main` ref 发布
- **registry + provenance 回读**:`npm publish` 后不只等版本可见，还必须读到精确的 `dist.attestations.url` 和 SLSA v1 predicate；缺 provenance 则工作流失败
- **签名与安装实测**:工作流从官方 registry 安装新包、核对可执行文件版本，并通过 `npm audit signatures` 验证 registry signature 与 provenance attestation
- **可恢复发布**:发布与回读拆为独立 job；已存在版本或 `npm publish` 响应不确定时，只有 registry `dist.integrity` 与已审 tarball 精确一致才继续，并由 5 个发布状态回归覆盖
- **发布身份收紧**:OIDC job 的第三方 Action 固定到完整 commit SHA，并绑定需人工批准且仅允许受保护分支的 `npm-publish` GitHub Environment；npm Trusted Publisher 仍必须配置同名 environment
- **候选与分发证据分离**:`package.json`/manifest 可表达 `1.16.2` 候选，但可执行的 `npx`/安装文档在新版本完成 registry/provenance/安装回读前继续指向已独立验证的 `1.16.1`
- **证据边界**:workflow/绑定/tag 存在都不等于 OIDC 发布已验证；只有新版本工作流成功、registry/provenance 回读和独立安装全通过后，才能创建匹配的 GitHub Release
- **真实发布验收**:`solobaton@1.16.2` 已通过 GitHub OIDC 发布，官方 registry `latest`/精确 tarball/SLSA v1 provenance/registry signature/attestation/隔离安装/只读 `doctor` 独立回读全部通过；精确发布物由 `v1.16.2@368f1f2` 保全，并已创建匹配的 GitHub Release

## v1.16.1 — 2026-08-22

> 主题:把 CLI v0 从“只可源码运行”推进到可审计的 npm 公共分发。脚手架版本仍是 v1.16，项目写入能力仍未开放；本补丁只建立 CLI 包的安装、更新、移除和发布证据链。
> **拷出项目升级**:业务模板和已拷出项目零修改。`npm uninstall --global solobaton` 只移除全局 CLI，不删除项目中的 Solobaton 文件；项目生命周期 `solobaton upgrade/uninstall` 仍保持 fail-closed。

- **正式 npm 入口**:发布 `solobaton@1.16.1`；一次性运行使用带版本的 `npx --yes solobaton@1.16.1 ...`，全局安装使用 `npm install --global solobaton@1.16.1`
- **包生命周期与项目生命周期分离**:`npm install --global solobaton@latest` 更新 CLI 包，`npm uninstall --global solobaton` 移除 CLI 包；二者都不写业务项目，也不等价于尚未开放的 `solobaton upgrade/uninstall`
- **发布护栏**:`publishConfig` 固定 public npm registry 和公开可见性，`prepublishOnly` 重跑 CLI、文档与 pack 检查；文档检查要求包版本、Changelog、安装命令和 manifest 示例对齐
- **分发元数据**:补齐 homepage 与 issue tracker；包继续保持零第三方运行时依赖、Node.js 20+，并携带 canonical templates、Skill、CLI 合同和示例
- **回归证据**:CLI 19/19、Shell 行为 38/38，并对实际 tarball 做隔离安装、版本、`doctor` 和零项目写入验证
- **后续发布安全**:首次包创建使用 npm 交互式 2FA；包存在后切换到 GitHub Actions Trusted Publishing/OIDC 和自动 provenance，不保存长期发布 token

## v1.16 — 2026-08-22

> 主题:建立 `Skill + CLI` 双入口的第一块确定性地基。CLI v0 只做 `doctor` 与 `init/adopt --dry-run`,把项目扫描、布局识别、生命周期阻塞和未来文件所有权规则变成可测试接口;所有写操作继续 fail-closed,不拿“规划中的 upgrade/uninstall”冒充已交付能力。
> **拷出项目升级**:没有模板文件需要替换。项目可把 `SOLOBATON.md` 版本更新为 v1.16;若从上游源码运行 `node bin/solobaton.js doctor <项目根>`,旧项目会被诚实标为 `legacy/unmanaged`(缺 manifest),不影响现有 Shell 护栏。CLI 尚未发布 npm,不要写 `npx solobaton` 作为已可用安装路径。

- **零依赖 Node CLI v0**:新增 `package.json`、`bin/solobaton.js` 与 `src/`;要求 Node.js 20+,包内带 canonical templates,但运行时不引入第三方依赖
- **只读生命周期命令**:`doctor` 检查安装/布局/版本/关键文件/占位符/Hook/依赖降级;`init --dry-run` 规划默认布局;`adopt --dry-run` 规划紧凑布局和存量接管;均支持稳定 `--json`
- **写操作 fail-closed**:`init/adopt` 缺 `--dry-run` 返回 exit 2 且零写入;`diff/upgrade/uninstall` 只保留命令名并明确返回未开放,避免把危险半成品包装成正式能力
- **生命周期合同**:`docs/CLI.md` 冻结 `replace-if-unmodified / three-way-only / project-owned / merge-only` 四类文件策略、manifest schema 1、升级三方比较、卸载保留规则、事务回滚和 Hook/.gitignore 合并边界
- **扫描隐私边界**:最多四层/5,000 条目,跳过构建与 vendor 目录,不跟随 symlink;JSON 只输出路径/计数/能力元数据/finding code,不回显源码、配置值或 Secret
- **CLI 回归与 CI**:Node 内置测试覆盖 19 个场景;CI 在 Node 20/24 与 Ubuntu/macOS 组合执行 `npm ci`、测试和 pack 内容检查
- **刻意未做**:没有项目文件写入、manifest 落盘、自动升级/卸载、npm publish、Git 初始化/提交/推送或 Windows Shell 护栏兼容声明;Skill 仍负责代码级理解、少量提问和人 Gate

## v1.15 — 2026-08-22

> 主题:从「PR 里描述做过验证」迈到「仓库自己可重复证明」。README 只承担定位与上手,完整规则继续单点留在 SKILL;已发生过的脚本回归变成动态沙盘测试,PR/main 变更由 CI 自动执行。
> **拷出项目升级**:整文件替换 `scripts/bus-check.sh`、`scripts/design-preview.sh`、`scripts/pre-commit.sh`(紧凑布局则替换 `pm/scripts/` 同名文件),更新项目 `SOLOBATON.md` 版本即可。三处都是带空格路径/静态检查兼容补丁,没有新增流程 Gate 或配置项;仓库自身的 `.github/`、`tests/` 不拷进业务项目。

- **README 渐进式重构**:中英文首屏统一为「交付协议与脚手架,不是 Agent Runtime」;保留一句话 Bootstrap、存量接管、适用边界和能力降级;删除长样例输出、十条规则复述和不可持续的兼容性绝对声明,完整语义链接回 `SKILL.md`
- **仓库行为回归套件**:`tests/test-scripts.sh` 用 `mktemp` 动态创建隔离 Git 沙盘,覆盖默认/紧凑布局、协调层腐烂、幽灵 hash 与 URL 边角、多域 status、换期例外、批量 stage、契约提示降噪、gitleaks 阻断、验证占位符、真渲染路径和漂移基线保护,当前共 38 个断言
- **文档可移植性检查**:`tests/check-docs.sh` 校验全部受版本控制的 Markdown 相对链接、拒绝 `filecite/cite` 内部标记、核中英 README 结构/frontmatter/关键模板与示例版本,不再把一次性研究环境引用当交付证据
- **GitHub Actions CI**:PR 与 main push 自动跑 Bash 语法、ShellCheck、文档检查、commit whitespace,并在 Ubuntu/macOS 双平台跑行为套件;Windows 仍未声称支持
- **Shell 健壮性**:`bus-check.sh` 不再用 `ls | grep` 发现子仓,带空格的子仓名可稳定识别;`design-preview.sh` 不再用 `ls` 选择 HTML,带空格入口可正确 URL 编码;`pre-commit.sh` 的 status 计数改为单次 `awk`
- **刻意未做**:不新增 Gate/域/reviewer 模式,不先造完整 CLI,不拆出一组会复制 SKILL 语义的 docs;下一阶段先收外部试点数据再决定产品面扩张

## v1.14 — 2026-08-22

> 主题:给 reviewer 加 `review-ready` 硬前置与调用预算。写者先把候选收敛干净,独立 reviewer 再一次消费稳定候选;不再让 reviewer 充当实现中的后台 lint,也不让一个 subagent 用连续状态更新制造“框框 review”风暴。
> **拷出项目升级**:① 补丁修改根 `AGENTS.md` 规则⑥与红线 5;② 整文件替换 `.claude/agents/reviewer.md`;③ 更新 `指挥台.md` 的 review-ready 节奏;④ 更新项目 `SOLOBATON.md` 版本并在 `decisions.md` 记一次流程拍板。历史报告/status 不回改,脚本零改动。

- **review-ready 四项硬前置**:首次 milestone 只能在工作包实现/写者自查完成、所有候选仓 `HEAD=candidate` 且工作树干净、受影响/全量 L3 与真渲染证据绿、无已知待修或计划改 hash 后启动;缺一项就不派 reviewer
- **首次 milestone 前不做伪 delta**:鉴权/租户/Secret/fail-closed/持久化等写者自发现问题先集中进实现语义清单并自行收敛;只有修改已冻结对外契约或不可逆副作用才提前 `STOP_NOW`,批准后按一个风险批次核 `risk-delta`
- **reviewer 调用预算**:每工作包每 Gate 默认 1 次 milestone;首轮 P0/P1 合并修完后 1 次 closure,P2 不复核;milestone 完成后真正新生的高风险语义才追加 `risk-delta`
- **旧候选立即作废**:reviewer 返回前 candidate 改变 → 本次审查标 `SUPERSEDED` 并停止;写者重新收敛到 review-ready 后才启动替代 milestone,不得把连续自修包装成 delta 链
- **单次静默输出**:reviewer 除输入缺失/真实阻塞外不发中间进度和分批 findings,整个 scope 核完后一次返回;`milestone` 缺 review-ready 证据只回 `NOT_READY`,不制造 P0/P1/P2 报告
- **文档与模板同步**:`SKILL.md`、中英 README、`templates/AGENTS.md`、reviewer、指挥台及 example 更新;新反模式记入 lessons 第 18 条

## v1.13 — 2026-08-22

> 主题:把「细粒度追踪」与「执行/审批粒度」解耦。会话按用户级工作包持续推进,不因子文档/commit/reviewer/status 过早结束;审批分 `STOP_NOW / BATCH_AT_GATE / NO_APPROVAL`,只让真正改变授权、冻结语义或不可逆状态的事项立即打断人。
> **拷出项目升级**:① **只补丁修改**根 `AGENTS.md` 规则③/⑤/⑦/⑨并新增「任务包与人批节奏」(项目自己的域表与扩展规则不得被模板整文件覆盖);② 在当期看板新增「当前工作包 + 决策收件箱」,更新 `pm/decisions.md` 的决策包口径、`pm/changes/README.md` 的草案/冻结分界、`pm/status/README.md` 的按包更新口径与 `指挥台.md`;③ 更新项目 `SOLOBATON.md` 版本并在 `decisions.md` 记一次流程拍板。历史部分决策行/status 不回改,脚本与 reviewer 模板零改动。

- **任务包信封**:多步骤工作明确 `objective / in_scope / terminal_condition`;需求 ID、验收项、原子 commit 继续细分但只作追踪单位。目标范围内仍有安全可逆工作就自动继续;单个文档提交、reviewer 返回、status 回写或普通 P2 不再构成任务结束
- **终止条件收紧**:只允许「用户级目标带证据完成 / 必须由人处理的真实阻塞 / 用户明确只要检查点」三类;从流程上消灭交一个子产物就等用户说“继续”
- **审批三级**:`STOP_NOW` 覆盖跨 Gate、扩范围、已冻结对外语义、不可逆外部动作与风险接受;`BATCH_AT_GATE` 把冻结前可逆选择攒到门前默认一次问 2–5 个(确实只有 1 个就单项);事实、推导约束、归档/status/P2 与不改外部语义的可逆细节走 `NO_APPROVAL`
- **人批预算**:每个工作包、每道 Gate 默认只有 1 个批量审批请求;用户部分回答/要求解释继续沿用同一决策包编号,不重新包装成新审批;不阻塞的工作继续推进
- **决策包而非验收项逐条批**:产品域先区分独立决策变量与派生验收约束;只把前者送人批。分轮回答暂存看板决策收件箱,收敛后 `decisions.md` 只记一行,不再沉淀 `3/14 → 11/14 → 14/14` 式部分状态
- **草案/冻结分界**:`pm/changes/` 允许在已批准工作包内持续收敛草案和补证,到 Gate 一次冻结;冻结前不得冒充 canonical 或进入共享实现,冻结后语义 delta 才触发立即停与回流
- **状态降噪**:原子 commit 保持可回滚,但 status 只在工作包完成、里程碑候选形成或真实阻塞时更新;记录的是交付候选/报告 hash,不是 status 自身 commit(禁止自引用),提交粒度不再决定交互粒度
- 本次回灌来自真实运行数据:任务/状态提交密度、部分决策行和审批式收尾显著高于用户级成果数。解药记入 lessons 第 17 条

## v1.12 — 2026-08-22

> 主题:核查门从「按小任务反复全审」校准为「机器闸常驻 + 高风险 delta 定向核 + 里程碑候选一次全核」,保留写者≠审者,降低流程吞吐损耗。
> **拷出项目升级**:① **只补丁修改**根 `AGENTS.md` 规则⑥与红线 5(项目自己的额外规则/域表不得被模板整文件覆盖);② 整文件替换 `.claude/agents/reviewer.md`;③ 更新 `pm/changes/README.md` 的「实现语义清单 / 候选 hash 集」、当期看板核查门行与 `pm/status/README.md` 的结论摘要口径;④ 在项目 `decisions.md` 记一次流程拍板。历史核查报告不回改,脚本零改动。

- **三层核查分工**:轻量机器闸每次提交,受影响自动化测试按变更批次,里程碑候选跑全量并留证据;任务中只对冻结契约、鉴权/租户/Secret/fail-closed、持久化或不可逆外部副作用等高风险语义做定向 delta 核查;完整四方一致性审查绑定一个里程碑候选 hash 集,同一批只做一次
- **候选 hash 复用**:已核候选 hash 未变且机器证据仍绿,合并前直接复用原结论,不得为「再放心一次」重复全审;候选变化只核 `base..candidate` delta,finding 修复走 `closure`,新增高风险语义走独立 `risk-delta`
- **文件数不再充当风险语义**:`>=N 文件`仍可由 pre-commit 当批量 stage 卫生信号,但归档/改名/status 回写/草稿演进不因文件多自动触发完整 reviewer
- **阻塞口径收敛**:P0/P1 阻塞;P2 默认挂账、不触发一轮完整复核(项目可在立项时显式升格)。首轮报告保留问题原文,后续仅追加 finding closure 表,不复制整段背景
- **实现期不靠记忆**:`pm/changes/` 模板新增「实现语义清单」,只记新增失败态、不可达状态、默认值/阈值、fail-closed 方向等实现期自由度;到里程碑核查一次消费,替代每个微任务各写一份报告
- **reviewer 模板增加三种模式**:`milestone` / `risk-delta` / `closure`,明确输入 hash、审查边界与结论不可外推范围;完整报告默认只在 milestone 产生
- 本次回灌来自真实项目的人机工程反馈:当审查产物开始大于交付产物、同一语义链在任务收尾/合并前/阶段门被重复核,核查门已从防线退化为吞吐瓶颈。解药记入 lessons 第 16 条

## v1.11 — 2026-08-08

> 主题:装载入口去厂商化(回灌教训 15)。**breaking(两个文件改名)**:拷出项目要跟着改名 + 复核全仓引用。
> **拷出项目升级**:① `CLAUDE.md` 改名 `AGENTS.md`(内容原样搬,不改一字)→ 原位新建一行指针 `CLAUDE.md`(拷 `templates/CLAUDE.md`);② `Agent.md` 改名 `ARCHITECTURE.md`;③ 复核残留 `grep -rn 'CLAUDE\.md\|Agent\.md' <项目根> --include='*.md'`,应只剩指针文件自身与 CHANGELOG 历史条目。

- **装载入口从 `CLAUDE.md` 换成开放标准 `AGENTS.md`**:此前只认 `AGENTS.md` 的工具(Codex CLI / Gemini CLI / Aider / Zed 等)完全装载不到总线规则,开工护栏与状态分写在那些会话里**静默失效**——而并行多会话正是本方法论的核心场景,厂商锁在这里杀伤面比单会话大一个量级
- **`CLAUDE.md` 降级为一行指针**(兼容只认此名的工具):🔴 不复制内容(复制 = 自造 lessons 第 1 条 SSOT 腐烂);🔴 不用符号链接(Windows 上 git 默认 `core.symlinks=false`,clone 出来静默退化成文本文件)
- **`Agent.md` → `ARCHITECTURE.md`**:原名与标准 `AGENTS.md` 仅差一个 S、语义却相反(前者按需读 / 后者自动装载),是长期的人机双向误判源
- **白捡标准的层叠语义**:向上收集沿途所有 `AGENTS.md` 合并、就近优先 → §8.5「分层 `AGENTS.md`」不必自己定义优先级,根写全局 / 子仓写局部,根文件因此能保持精简
- **明确拒绝 `AGENTS.override.md` 类本地覆盖**(SKILL §3):装载入口装的是红线与护栏,允许不进 git 的覆盖 = 给绕过护栏开后门,reviewer 与 pre-commit 都看不见
- 顺手修一处既有漂移:SKILL §7 原写「红线……写进 `Agent.md`」,而红线实际单点在装载入口 §3,改为「单点写进根 `AGENTS.md` §3」
- 同步范围:SKILL(§3 布局图 + 装载约定段 / §4 / §7 / §8.1 / §8.2 / §8.5 / §9 模板索引)、双语 README 文件树、`templates/` 与 `example/` 全部交叉引用;**5 个脚本零改动**(本来就不引用这两个文件名)

## v1.10 — 2026-08-08

> 主题:协调层布局可搬迁(治 §8.5 接管存量项目的 `scripts/` 撞车)。**非 breaking:默认布局路径一字未改,已落地项目只换脚本即可。**
> **拷出项目升级**:`scripts/` 下 5 个 `.sh` 整文件替换;`SOLOBATON.md` 加「协调层布局」一行。

- **5 个脚本改为自定位协调层根**:此前一律写死 `ROOT=$(dirname $0)/..`(= 假设"脚本必须在根下一层"),现改为**向上最近的含 `pm/NOW.md` 的目录**(上探 4 层,探不到退回旧假设)。于是 `scripts/` 整树可以原样搬到 `pm/scripts/`,脚本零改动
- **脚本间互调改走 `SDIR`(本脚本目录)**:`verify-status.sh` / `live-status.sh` / `drift-check.sh` / `live-config.sh` 的调用与"未配置"提示、`bus-baseline.json` 与 `.last-green-*` 的落点,全部随脚本目录走——不再写死 `scripts/`。同伴脚本约定为"与 bus-check 同目录"
- **pre-commit 闸② 两种布局都认**:`scripts/bus-check.sh` 与 `pm/scripts/bus-check.sh` 依次探测,提示里回显实际路径;子仓仍按"无 `pm/NOW.md` 即跳过"自动放过
- bus-check 表头加打 `(协调层脚本: <SDIR>/)`:根解析错了(嵌套项目 / 骨架没建)一眼看得见,不静默假绿
- **SKILL §3 新增「布局二选一」表**:默认(根上 `scripts/`,§8 从零起项目用)/ 紧凑(`pm/scripts/` + `pm/指挥台.md` + `pm/SOLOBATON.md`,项目根只多 `pm/` 一个目录,§8.5 接管存量项目用);🔴 一个项目只选一种、路径统一填实,混写 = 自造 SSOT 腐烂;并点明 `CLAUDE.md` 与 `.claude/agents/` 是工具装载约定、永远在根、与布局无关
- **§8.5 增第 5 步**:接管存量项目默认走紧凑布局,列出需改调用路径的 6 个文档 + `grep` 复核命令(存量项目根几乎必有自己的 `scripts/`,协调层混进去会和它的构建/部署脚本搅在一起)
- `SOLOBATON.md` 增「协调层布局」标记行(规则⑨ 单点事实:布局是哪种,单点可查);README 双语同步接管段
- 实测覆盖:两种布局各跑 bus-check(工作区根解析 / 子仓自动发现 / 提示路径回显)、pre-commit 闸②(干净放行 + 腐烂拦截)、`verify-status --run` 标记落点、从子仓 cwd 调用、无骨架兜底

## v1.9 — 2026-08-01

> 评估(第三版)回灌:消灭「常驻红字」(D2)——红字 = 真有事,是腐烂检测全部价值所在;太吵会瞎,和太松会漏同罪。
> **拷出项目升级**:`scripts/pre-commit.sh`、`scripts/bus-check.sh` 整文件替换;新增 `scripts/verify-status.sh`;`.gitignore` 加 `.last-green-*`;`pm/NOW.md` 换期 checklist ① 加 `BUS_ALLOW_BULK` 提示。

- **收窄闸⑤(D2 源头一,真实仓回放 59% 提交误响)**:只看契约**提供方**(controller/endpoint/schema/.proto/routes),排除**消费方**(src/api/ 等客户端调用层、前端页面 router)——消费方是跟随契约不是改契约;匹配/排除模式可用 `BUS_CONTRACT_HINT` / `BUS_CONTRACT_SKIP` 按项目调
- **新增 verify-status.sh 参考实现(D2 源头二,此前是空插座)**:SUITES 表(npm/mvn 样例)+ `--run` 真跑并把「上次全绿时间」记进本地标记文件(`.last-green-*`,不入 git——新机器显示"从未全绿"是诚实的);还是占位符时如实 ⚠️
- **修 D1 残留**:反引号段同时含链接与 hash 时,改为从段内**抠掉** URL/digest 而非整段丢弃,真 hash 不再陪葬
- 换期 checklist ① 注明:归档超 40 文件会触发闸④,该单用 `BUS_ALLOW_BULK=1` 提交(评估指出的人机工程缺口)

## v1.8 — 2026-08-01

> 工业化差距评估(第二版)回灌:修 D1 误报、补齐规则机器化、存量项目入口、版本/回灌通道、证据分级。
> **拷出项目升级**:`scripts/bus-check.sh`、`scripts/pre-commit.sh` 整文件替换;`CLAUDE.md` 规则⑥/⑩ 补丁;新增根 `SOLOBATON.md`;`pm/NOW.md` 换期 checklist 第 4 条;`pm/status/README.md` 反引号约定。

- **修 D1 幽灵 hash 误报**(评估指出,实测确认):提取只认**反引号内** token(status 约定即解析规则)+ 排除 URL/digest 串 + 须同含字母与数字——`defaced`、URL 片段不再误拦提交;代价:纯字母/纯数字 7 位真 hash 良性漏检(约 0.1% / 3.7%)
- bus-check 新增**机器闸自检**:meta 仓与各子仓查 `.git/hooks/pre-commit`(或 core.hooksPath),未装红字——用在跑的闸守新闸
- bus-check 新增**工程层验证能力**段:接 `scripts/verify-status.sh`(每行「套件 命令 上次全绿」),未配置红字提醒「L3 证据无从谈起」
- pre-commit 补三道闸:**多域 status 同 commit 即拦**(规则⑦;换期仪式连同 archive/ 提交或 `BUS_RITUAL=1` 放行)、**暂存 >40 文件即拦**(红线2,像 add -A;`BUS_ALLOW_BULK=1` 放行)、**疑似接口文件未动 PROTOCOL 只提醒不拦**(规则②,契约在 meta 仓、代码在子仓,跨仓无法原子核验);修中文文件名被 git quotepath 转义导致规则匹配不上的 bug
- **证据分五级 L0–L4** 写进规则⑥(标准轨最低 L3=自动化测试过,重轨/上线必须 L4=线上实测;L1 `文件:行` 只作定位不单独作数)
- 新增 **§8.5 接管存量项目**(10→N 入口):摸底(全自查)→ 划绞杀者边界(新地盘全套总线 / 老地盘只维护走重轨)→ **第 0 期强制补最小验证套件** → 分层 CLAUDE.md
- 新增 **templates/SOLOBATON.md 版本标记**:项目根记录所用版本;升级对照 CHANGELOG 各版的「拷出项目升级」行;回灌通道挂进换期仪式(「回灌一问」)
- 元原则「**能实查的不问人**」入 §4 正文与模板 CLAUDE.md(规则⑨/②的推广,与 Bootstrap 提问三原则同源)
- README 双语同步:接管仪式入口、文件树、白话表新增「证据分级 / 接管仪式 / SOLOBATON.md」

## v1.7 — 2026-07-31

> 主题:规则从「靠自觉」到「有机器闸」(外部工业化差距评估回灌第一步:每条规则问一句「违反了会怎样」,答案是「靠自觉」的就机器化)。

- bus-check 新增 **`--strict` 机器闸模式**:确凿检出「协调层腐烂 / 幽灵 hash / 生产漂移」任一即 exit 1;「无法判定/未配置/跳过」不拦,不给流水线添堵;不带参仍恒 exit 0 只当仪表盘
- bus-check 新增**幽灵 hash 核验**:pm/status 里每个 commit hash 逐个对 meta 仓 + 全部子仓 `git cat-file -t`,查无此号红字报警(lessons 第 11 条机器化;此前只能靠接手会话自觉核)
- drift-check 退出码语义化:确凿检出漂移 exit 2(供 --strict 拦截);无漂移/跳过/无法判定仍 exit 0,`--update-baseline` 失败仍 exit 1
- 新增 `templates/scripts/pre-commit.sh` **红线机器闸**:gitleaks 扫暂存区拦凭据(v8.19+ `git` 子命令与旧版 `protect` 自适应)+ meta 仓 bus-check --strict 拦腐烂/幽灵 hash;红线3 已禁 `--no-verify`,闸绕不过
- **gitleaks 从"可选"转默认**:Bootstrap checklist 第 7 步改为默认装机器闸(此前 gitleaks 只作为可选 Stop hook 的前置出现,不装 hook 就整个不出现——正是 lessons 第 10 条的坑);Stop hook 自动 push 顺延为可选第 8 步
- decisions.md 增「**拍板人**」列:单人项目固定写自己;Gate3 合并与 Gate4 上线未必同一人批,审计与将来多人由此可查(模板与 example 沙盘同步)
- README(中英)同步:§2 手动路径补装闸命令、§4 示例输出补幽灵 hash 核验段与拍板人列、§5 机制、§6 文件树、§8 规则④、§9 白话表新增「机器闸 / gitleaks / pre-commit hook」

## v1.6 — 2026-07-28

> 全项目 review 回灌(3 个独立审查代理交叉核查 + 脚本沙盘实测)。

- **修沙盘时间线硬伤**:Gate3 拍板改 06-19(此前 06-18,早于 P1 发现日,因果倒置);回写落点 ④→⑤;P1 归属统一为"走查发现";README 双语示例块同步
- **修 drift-check 基线保护**:`--update-baseline` 任一应用查询失败即拒绝落盘并 exit 1(此前平台 CLI 全失败会用空基线**覆盖好基线**,漂移信号永久丢失);检测模式全失败改报"无法判定"而非谎报"无漂移";APPS 数组清空不再 unbound variable 崩
- **bus-check 检测诚实化**:NOW 缺失/占位符时如实报"无法判定/跳过"而非打假 ✅;新增当期看板坏指针告警;meta 仓仅本地领先时提示 git push(此前误导性提示 pull)
- 中文 README:去掉作者本机路径前缀 `AI底座/`;首句"活塞"歧义改"活儿都塞";示例块与脚本实际输出逐字对齐;§6 树补 gitignore.template(中英同)
- 英文版:SSOT 统一为 single source of truth 并展开缩写;补漏译(开工四步行/P1 bug 名/或无上游/若干从句);5 处措辞修正(主语错位/It.2 等)
- 口径统一:SKILL"两个后端"改"多个"(与 README 一致);SKILL §6 归档清单补"需求";lessons 第 4 条解药行随域改名;模板/沙盘内 lessons 引用注明"solobaton lessons"出处(拷入新项目后不再悬空)

## v1.5 — 2026-07-28

- bus-check 新增**协调层腐烂检测**:NOW 长肥(>40 行)/ 非当期看板滞留 pm/ / status 超长(>60 行),开工红字报警;阈值 `BUS_NOW_MAX` / `BUS_STATUS_MAX` 可调(仪式没有护栏 = 没有仪式)
- 新增期产物归档约定:走查图 / E2E 报告等证据**生成时即写** `pm/archive/<期>/evidence/`,换期零搬运;换期 checklist 增第 ④ 条(核对证据归位、无散落临时文件)
- README 双语同步机制说明与 bus-check 示例;README 底部不再写"当前 vX"(版本这个事实也只留 CHANGELOG 一处)

## v1.4 — 2026-07-26

- 新增 `example/` 教学沙盘:虚构「简账」记账应用跑完一期的全套总线文件快照(内容全部虚构脱敏,hash 为示意值)
- 新增英文版 README(`README.en.md`),中英 README 顶部互链
- README §4 新增 bus-check 示例输出(节选);版本史迁出至本文件
- templates 新增 `gitignore.template`(meta 仓排除子仓与 `*.env`;文件名不带点,避开 cp 丢点文件的坑)
- Bootstrap 第 7 步补 secret 扫描示例命令(gitleaks)
- bus-check.sh 健壮性:无 perl 时降级为不截断输出;新增 `BUS_CHECK_NO_FETCH=1` 离线/弱网跳过 fetch
- GitHub 仓库补 topics(claude-code / ai-agents / multi-agent 等)

## v1.3 — 2026-07-26

- Bootstrap 改引导式:先自查代码(仓数/平台/UI/契约边界),只问 3–4 个非技术问题,一屏确认再生成,占位符全部填好
- 三域默认名改为 产品 / 全栈(含运维)/ 测试;访谈新增「分工用默认还是自定义」一问
- README 简介重构:先说解决什么问题(含单会话困局),再说怎么用,附记账应用实例(含首次对话设定角色);新增 §9 名词白话表
- 修复:快速上手 cp 命令 `*` 不匹配点文件会丢 `.claude/agents/reviewer.md`,改为 `cp -R templates/.`
- 修复:README mermaid 在 GitHub 渲染失败(标签全加引号 + `<br/>` 闭合)
- drift-check 指纹注释补诚实边界:低熵值可被字典猜出,基线按半敏感文件对待

## v1.2 — 2026-07-04

- 回灌教训 14(UI 元注释复发);新增 CLAUDE.md §1.5「界面零元注释」红线;reviewer 审查清单第 6 条

## v1.1 — 2026-07-02

- 回灌三周实战:生产漂移检测机制(drift-check.sh:env 指纹基线 + 镜像 tag↔git 锚定)+ 教训 11–13

## v1 — 2026-06-10

- 首次蒸馏:方法论主体(四支柱 / 域模型 / 十条规则 / 四 Gate + 三轨 / 三仪式 / 红线)+ 模板脚手架 + 教训 1–10
