# Changelog

> 本项目吃自己的狗粮(红线④:必更 CHANGELOG)。格式循 Keep a Changelog,倒序。

## v4.2.2 — 2026-10-07（补丁：README 重新设计）

> **发布状态**：`@haiyangbg/buildbeat@4.2.2` 已于 2026-10-07 从 `main`（release PR #81，merge commit `3a43ae3`，tag `v4.2.2`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 37637179739，publish 与 verify 双 job 一次 success；所有者授权「合并并发 4.2.2」）。独立回读（直连 npmjs.org）：`latest` = 4.2.2、`dist.integrity` 与本地用 Node 24 + npm 11.19.0 打的候选逐字一致、注册表 tarball 解压后与候选逐字节相同、SLSA v1 provenance、隔离安装 `--version` = 4.2.2、裸调用零写入、`npm audit signatures` 通过；GitHub Release v4.2.2 标 Latest；证据见 [`docs/releases/V4.2.2-RELEASE-EVIDENCE-2026-10-07.md`](docs/releases/V4.2.2-RELEASE-EVIDENCE-2026-10-07.md)。同日所有者本人经 npm 两步验证把 dist-tag `next` 从 4.2.0 挪到 4.2.2；直连 npmjs.org 回读 `next` = `latest` = 4.2.2。

- README (zh/en) redesigned for reading: a hero picture, the name's meaning (every step is a note the agent plays; the played score stays in Git), a delivery-loop diagram in light and dark with a stacked layout for phones, the three promises as short sections, a real `status` excerpt at the merge decision, and which records travel with Git and which stay on this machine. Pictures live in `docs/assets/readme/` (the loop diagram is drawn by `diagrams.mjs`) and are linked through raw URLs so the npm page shows them too; `check:docs` now requires every README picture to exist, carry alt text and stay under 600 KB.

## v4.2.1 — 2026-10-07（补丁：审查没交报告当场停；成本按去向分开等待）

> **发布状态**：`@haiyangbg/buildbeat@4.2.1` 已于 2026-10-07 从 `main`（release PR #79，merge commit `8d2625b`，tag `v4.2.1`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 37626818833，publish 与 verify 双 job 一次 success；所有者授权「推送并发 4.2.1」）。独立回读（直连 npmjs.org）：`latest` = 4.2.1、`dist.integrity` 与本地用 Node 24 + npm 11.19.0 打的候选逐字一致、注册表 tarball 解压后与候选逐字节相同、SLSA v1 provenance、隔离安装 `--version` = 4.2.1、裸调用零写入、`npm audit signatures` 通过；GitHub Release v4.2.1 标 Latest，仓库 About 同日更新；证据见 [`docs/releases/V4.2.1-RELEASE-EVIDENCE-2026-10-07.md`](docs/releases/V4.2.1-RELEASE-EVIDENCE-2026-10-07.md)。`next` 仍为 4.2.0。

- A review step that exits 0 without writing a report to `$BUILDBEAT_OUTPUT` now stops as `invalid-output` (an infrastructure failure: no fixer, no charge, `resume-review` waits for a person) instead of passing with no evidence until the merge approval refused it. The stop reason says where the report belongs and, when the reviewer printed something, how many bytes went to stdout. Found in a replay of real runs, where a reviewer's 3 P1, 6 P2 and 4 P3 findings reached stdout only.
- The cost line splits human waits by how they ended: `human waits N (decided … · superseded … · stopped … · open …)`, listing only kinds that occurred; a request repeated before any decision continues the same wait, so overlapping time is not counted twice; JSON carries `cost.waits` with `{count, ms}` per kind and run-records keep it. In the same replay one work showed 32 minutes of decided waits while 11 hours passed on a request a new run superseded.
- README (zh/en) describes the 4.x product: the three promises now name the mechanisms behind them (one `work.md` driven by `buildbeat run` and `status --all-repos`; evidence read back from Git and infrastructure stops instead of code fixes; merge approvals bound to the candidate and repairs at the merge decision), the cost line's waits, taking part without the runtime and the release readback.

## v4.2.0 — 2026-10-07（次版本：合并决定点能接修复；合并批准绑定候选）

> **发布状态**：`@haiyangbg/buildbeat@4.2.0` 已于 2026-10-07 从 `main`（release PR #76，merge commit `cc52ad3`，tag `v4.2.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 37597691057，publish 与 verify 双 job 一次 success；所有者授权「推送并发 4.2.0」）。独立回读（直连 npmjs.org）：`latest` = 4.2.0、`dist.integrity` 与本地用 Node 24 + npm 11.19.0 打的候选逐字一致、注册表 tarball 解压后与候选逐字节相同、SLSA v1 provenance、隔离安装 `--version` = 4.2.0、裸调用零写入、用法含 `--candidate <sha>` 与 `--action fix`、`npm audit signatures` 通过；GitHub Release v4.2.0 标 Latest；证据见 [`docs/releases/V4.2.0-RELEASE-EVIDENCE-2026-10-07.md`](docs/releases/V4.2.0-RELEASE-EVIDENCE-2026-10-07.md)。合并后 `main` CI 第 1 次尝试因跨仓测试快照混入 git 后台维护的锁文件失败、重跑转绿后才批准发布，测试修复随收尾合入。同日所有者本人经 npm 两步验证把 dist-tag `next` 从 4.0.0 挪到 4.2.0；直连 npmjs.org 回读 `next` = `latest` = 4.2.0。

- Bind merge approval replies to `--candidate <sha>` and forward the binding through the CLI; reject old or unbound replies after repair. Support both repair paths when the current candidate is still the base commit. Isolate repair regression fixtures from host Git configuration, signing and hooks. The owner confirmed the public name `--candidate <sha>` and runtime 4.2 as the next minor on 2026-10-07; merge-decision `run --adopt`, `decide --action fix` and candidate binding require runtime 4.2 or later.
- Allow manual repair adoption at the merge decision: require clean actual HEAD, a new descendant of the candidate and changes within `allowedPaths`; resume at verify, review incrementally and return to the merge decision while preserving evidence and review accounting.
- Add `decide --action fix --reason <text>` at the merge decision when a fixer is configured. Record an accepted P1 with the human's reason, feed it to the fixer and continue through verify/review without spending a review round for the decision or changing budgets. Status, inbox and notifications offer manual repair and the configured fixer path. SUCCEEDED and legacy 3.x Runs retain their existing boundaries.

## v4.1.0 — 2026-10-07（次版本：跨仓总览；提示里的命令与路径都能照做）

> **发布状态**：`@haiyangbg/buildbeat@4.1.0` 已于 2026-10-07 从 `main`（release PR #74，merge commit `9259ac9`，tag `v4.1.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 37590027989，publish 与 verify 双 job 一次 success；所有者授权「推送并发 4.1.0」）。独立回读（直连 npmjs.org）：`latest` = 4.1.0、`dist.integrity` 与本地用 Node 24 + npm 11.19.0 打的候选逐字一致、注册表 tarball 解压后与候选逐字节相同、SLSA v1 provenance、隔离安装 `--version` = 4.1.0、裸调用零写入、用法含 `--all-repos`、`npm audit signatures` 通过；GitHub Release v4.1.0 标 Latest；本机两份全局安装均为 4.1.0；证据见 [`docs/releases/V4.1.0-RELEASE-EVIDENCE-2026-10-07.md`](docs/releases/V4.1.0-RELEASE-EVIDENCE-2026-10-07.md)。`next` 仍为 4.0.0。

- Add read-only `status --all-repos`: discover the main repository, configured target checkouts and immediate child repositories, deduplicate real paths, show pending decisions first and count settled work. JSON retains all work; `--work` filters across repositories, while `--run` requires single-repository status.
- Fix main-repository status/overview reporting target-repository work as ready to start: read state, findings and decisions from the target, retain the main run configuration for commands, and quote paths relative to the caller. Missing/invalid targets warn without hiding other work. Ship `src/v2/runtime/overview-repos.js` and update the package-file inventory for this runtime helper.
- Hints give commands that work as written. A merged work whose run configs were all read and none has a `release:` section is told there is nothing left to do, instead of being sent to `buildbeat release`, which fails without that section and left the work unable to close; with a `release:` section the hint names the config that has it. A waiting run with no reply commands points to `status --work`, and `check` names `status` instead of the 3.x `inbox`. The run config template comment (and its copies in the Skill, both quickstarts and the example) names `check` / `run` / `--new`, and the quickstart says where the npm package installs the templates. Found by a first run of a fresh project on 4.0.0 with real codex workers.
- `status --all-repos` prints English labels like the rest of the CLI (`pending decisions · <repo>`, `repo <repo>:`, `<repo>: settled N (closed a · cancelled b · merged, no release step c)`, `repo:` / `runs in:` under a work), and single-repository status again shows `NO_INTENT` for a work directory without a work description even when it has runs, as 4.0.0 did; a work known only from runtime ledgers still shows its run.

## v4.0.0 — 2026-10-04（主版本：聚焦可恢复交付，精简产品范围与操作入口）

> **发布状态**：`@haiyangbg/buildbeat@4.0.0` 已于 2026-10-05 从 `main`（PR #70、#71 内容，release PR #72，merge commit `c15fbe0`，tag `v4.0.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 37262387333，publish 与 verify 双 job 一次 success；所有者授权「合并并发 4.0」）。独立回读（直连 npmjs.org）：`latest` = 4.0.0、`dist.integrity` 与本地用 Node 24 + npm 11.19.0 打的候选逐字一致、SLSA v1 provenance、隔离安装 `--version` = 4.0.0、裸调用零写入、用法含 `release` 与 `decide --action close`、`npm audit signatures` 通过；GitHub Release v4.0.0 标 Latest；本机两份全局安装均为 4.0.0；证据见 [`docs/releases/V4.0.0-RELEASE-EVIDENCE-2026-10-05.md`](docs/releases/V4.0.0-RELEASE-EVIDENCE-2026-10-05.md)。同日所有者本人经 npm 两步验证把 dist-tag `next` 从 3.3.1 挪到 4.0.0；直连 npmjs.org 回读 `next` = `latest` = 4.0.0。

- Owner decisions before 4.0 (WORK-4.0-INTENT-FOLLOWUPS): `requireScreenshot: true` makes verify write PNG screenshots of the real render to `BUILDBEAT_SCREENSHOT_DIR`, records them as candidate-bound evidence after checking each decodes, fails a verify that leaves none, requires them in the merge check and lists them for the reviewer, the decision card and notifications; `buildbeat release` runs the project's read-only readback after a merged release and records it in `delivery/work/<ID>/releases.jsonl`, and `decide --action close` closes the window only on a passing readback; a one-page guide states what people and tools without the runtime may read and write; the governance-template rationale is corrected.

- Focus the product on portable work context, the recoverable delivery loop, and evidence-backed human decisions.
- Retire observe execution, the release lane, UI-specific gates, generic workflow/Policy authoring, the optional governance templates (outside the delivery loop and never generated by default; kept under `docs/history/retired-templates`), and the separate Skill-only product path. Existing target-project files and historical records are never deleted by the CLI.
- Introduce work.md for new work; consolidate run/status/decide/check/history over shared runtime handlers. Core old command spellings remain compatibility aliases.
- Replace programmable gates with built-in acceptance and current-candidate evidence/review checks. Freeze safeguards with each new run so approval and resume cannot bypass or weaken them.
- Preserve official legacy delivery configurations and their exact workflow digest; reject unsupported custom/release configurations before side effects, with a migration route to finish active work on 3.3.1.
- Preserve cache, recovery, scope checks, parallel isolation, notifications, event schema and archived release readback. Update package contents, first-run regression coverage, and bilingual guides together.
- Review follow-ups: `run` only treats `<run>` and `<run>-NN` ledgers as its family; a finished run reports its outcome and points to `--new` instead of a configuration error; a legacy workflow config without riskPreset keeps having no artifact gate; legacy planner entry combined with an acceptance preset fails before any run; status hints name `run` / `work.md` for unified works.
- Independent review follow-ups: final approval also checks the candidate's copy of the bound work artifact (and intent.md under the legacy controlled safeguards), and resume refuses a changed bound artifact; start pins the base commit, refuses an artifact missing from it, and compares the isolated checkout itself with the accepted bytes before anything is recorded (a refused checkout and its branch are discarded); `run` selects the unique unfinished run across the whole family; the `requires:` probe regression and a frozen severity-floor refusal test are restored.
- The Skill checks `buildbeat --version` first and keeps 3.x runtimes on their own command spellings; status and notifications send a legacy 3.x run back to its original runtime instead of offering `decide`; the release checklist names the current install sections; workflow validation tests now change one field of the fixed workflow at a time; the 3.3.1 parity script also compares candidate trees, evidence, waiting kind and decisions.


## v3.3.1 — 2026-10-02（补丁：review 收敛判断认得出换了说法的同一问题；lessons 与发布 runbook 补齐）

> **发布状态**：`@haiyangbg/buildbeat@3.3.1` 已于 2026-10-02 从 `main`（PR #66 内容，release PR #67，merge commit `cc7a6db`，tag `v3.3.1`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 36982501415，publish 与 verify 双 job 一次 success；所有者授权「合并并发 3.3.1」）。独立回读（直连 npmjs.org）：`latest` = 3.3.1、`dist.integrity` 与本地用 Node 24 + npm 11.19.0 打的候选逐字一致、SLSA v1 provenance、隔离安装 `--version` = 3.3.1、裸调用零写入、包内含 `sameIssue` 与教训 23、`npm audit signatures` 通过；GitHub Release v3.3.1 标 Latest；本机两份全局安装均为 3.3.1；证据见 [`docs/releases/V3.3.1-RELEASE-EVIDENCE-2026-10-02.md`](docs/releases/V3.3.1-RELEASE-EVIDENCE-2026-10-02.md)。同日所有者本人经 npm 两步验证把 dist-tag `next` 从 3.3.0 挪到 3.3.1；直连 npmjs.org 回读 `next` = `latest` = 3.3.1。

- **review 收敛判断认得出换了说法的同一问题**：3.3.0 判断「修过的 finding 又出现」只认相同指纹（严重度 + 描述原文），而 reviewer 每轮会换行号、改措辞——回放 4 个仓 161 轮 review，按指纹一次都没对上，同一个问题却在一个 Run 里被连审三轮。新增 `sameIssue`：同指纹，或引用同一组文件且描述相近（字符二元组 Dice ≥ 0.5），或描述高度相近（≥ 0.6）；严重度不参与（P1 升 P0 仍算同一问题），同一组文件下描述只差行号也算；描述去掉文件与数字后不足 16 字时只认这两种精确情况。路径可以用反引号包起来。只用于收敛判断，finding 指纹、裁决台账与 dismiss 抑制不变。停人理由里换了说法的一条写成「本轮指纹 restates round N 原指纹」。阈值依据：回放中真实改写全部命中，无关 finding 最高 0.57、同文件无关 finding 最高 0.33。
- **文档补齐**：`lessons.md` 教训 14 的解药改为现行机制（原文仍写每 Run 2 轮封顶、分诊后才派 fixer），新增教训 23（中途审批点被驾驶会话自批、同一问题换说法认不出）；发布 runbook 要求候选用与发布 workflow 相同的 Node / npm 打包（否则 gzip 层不同、integrity 对不上，改比解压后的 tar），发布后检查 `which -a buildbeat` 列出的每一份全局安装；3.3.0 发布证据更正本机只更新了一份全局安装的事实。

## v3.3.0 — 2026-10-02（review 少停人：收敛止损、单一轮数上限、模板关分诊、intent+plan 一次接受）

> **发布状态**：`@haiyangbg/buildbeat@3.3.0` 已于 2026-10-02 从 `main`（PR #59、#62、#60、#61、#45 内容，release PR #63，merge commit `1ce1a7e`，tag `v3.3.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 36973733935，publish 与 verify 双 job 一次 success；所有者授权「发 3.3.0」）。独立回读（直连 npmjs.org）：`latest` = 3.3.0、发布包解压后的 tar 与发布前本地候选逐字节相同（只有 gzip 压缩层不同：本地 Node 22、CI Node 24，故 integrity 不同）、SLSA v1 provenance、隔离安装 `--version` = 3.3.0、裸调用零写入、已发布包的 `doctor` 显示 review 上限来源 `reviewRoundsPerWork`、`npm audit signatures` 通过；GitHub Release v3.3.0 标 Latest，证据见 [`docs/releases/V3.3.0-RELEASE-EVIDENCE-2026-10-02.md`](docs/releases/V3.3.0-RELEASE-EVIDENCE-2026-10-02.md)。同日所有者本人经 npm 两步验证把 dist-tag `next` 从 3.2.1 挪到 3.3.0；直连 npmjs.org 回读 `next` = `latest` = 3.3.0。

- **review 按收敛止损，不再按 2 轮封顶**：review 发现阻断问题、派 fixer 之前，内核把本轮 P0/P1 与本 Run 之前各轮比较。修过的 finding 又出现（同指纹，已 dismiss 的不算），或本轮阻断数多于上一轮，就停 `enter-fix`（新 kind `review-not-converging`，理由列出又出现的指纹或前后数量，请求不带 grants，批准不动预算）；阻断 finding 都是新的、数量不多于上一轮时自动继续。官方预设不再自带每 Run 2 轮的 `budgets.maxAttempts.review`，轮数上限改由下一条的 `reviewRoundsPerWork` 统一负责；run 配置里显式写的值照旧优先。开了 `reviewTriage: required` 时仍停分诊，不收敛理由并入同一请求；`nextReply` 对新 kind 给出 `findings list` / `findings adjudicate` 命令。原因：每 Run 2 轮封顶让正常修两三轮的 Run 反复停下批准扩额；本仓最近 10 个 Run 里中途 9 次批准都由驾驶会话自己批，人只出现在合并决定，审批点没起到人把关的作用。
- **review 轮数只剩一个上限**：`budgets.reviewRoundsPerWork` 不写时默认 6（此前不写即没有 Work 级上限）；review 步没有显式 `maxAttempts` 时，每 Run 上限取同一个值，不会先于 Work 上限触发，官方预设不再自带 `maxAttempts.review`。`doctor` 显示 review 上限来源为 `reviewRoundsPerWork` 并标出默认值；run 配置样板删去 `maxAttempts.review`。显式写的 `maxAttempts.review` 照旧生效。原因：每 Run 与每 Work 两套计数让同一轮 review 要按两层上限解释和放行，止损线本来就按 Work 定。
- **模板默认不再开发现分诊门**：`templates/v2/run-config.example.yaml`、示例项目、`SKILL.md` 与快速开始里的 run 配置样板从 `reviewTriage: required` 改为 `reviewTriage: off`，P0/P1 finding 直接派 fixer；高风险项目仍可改回 `required`。内核默认值本来就是不分诊，未改动；已有项目的 run 配置不受影响。原因：本仓最近 10 个 Run 中途 9 次停人里 7 次是分诊门的 `enter-fix`，且全部由驾驶会话自己批准，没有起到人把关的作用。
- **intent 与 plan 一次接受**：`accept --artifact intent,plan` 一条命令接受多份工件，每份仍各记一行 `accept-<artifact>`、各自绑定 digest，policy 与台账格式不变；任一文件缺失则一份都不接受。`overview` 在 intent 未接受且 plan 待接受时提示 `--artifact intent,plan`；`SKILL.md` 改为给用户看完摘要后只问一次「接受」。原因：本仓每个 Work 的 intent 与 plan 都在约 60 毫秒内先后被接受，两次接受实际是一个决定。

## v3.2.1 — 2026-09-26（补丁：开关参数单写、drive() 拆分、信封脚本测试、英文指南）

> **发布状态**：`@haiyangbg/buildbeat@3.2.1` 已于 2026-09-26 从 `main`（PR #54 内容、release PR #55，merge commit `8d5f7bc`，tag `v3.2.1`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 36241955690，publish 与 verify 双 job 一次 success；所有者授权「推送并发 3.2.1 / 继续」）。独立回读（直连 npmjs.org）：`latest` = 3.2.1、integrity 与发布前本地候选逐字一致、SLSA v1 provenance、隔离安装 `--version` = 3.2.1、裸调用零写入、已发布 CLI 接受单写 `--apply` / `--json`、包内 12 份英文指南在位且无 pilot / 历史文档、`npm audit signatures` 通过；GitHub Release v3.2.1 标 Latest，证据见 [`docs/releases/V3.2.1-RELEASE-EVIDENCE-2026-09-26.md`](docs/releases/V3.2.1-RELEASE-EVIDENCE-2026-09-26.md)。
>
> 同日所有者本人经 npm 两步验证把 dist-tag `next` 从 3.0.1 挪到 3.2.1（此前 `@next` 比 `@latest` 旧）；直连 npmjs.org 回读 `next` = `latest` = 3.2.1。

- CLI 开关参数可单写：`--json`、`--apply`、`--force`、`--once` 不必再跟 `true`（旧写法照旧有效）；缺值时报错点名参数（`--config needs a value`），多余的裸词报 `unexpected argument`。
- `drive()` 从 459 行的单一循环体拆成五个有名字的阶段函数（原代码按原顺序搬移，循环本身 19 行），review 步判定收成一处 `isReviewStep()`；行为零变化——未改动任何测试，全量通过。
- CodeQL 也分析推到 `v2` 的提交。
- M-1 脚本驱动试点 `pilot/` 归档到 `docs/history/pilot/`，不再进 CI 与发布前检查；CI 必需检查「Script behavior」改测随包发给用户的信封 `worker.sh`（`tests/envelope-worker.test.sh`，18 项，macOS 上用 `/bin/bash` 3.2 跑），`test:envelope` 取代 `test:pilot`。
- 7 份只有中文的指南补齐英文版（怎么和会话说话、Workflow、Policy、Adapter、Worker 合同、安全边界、指南索引），中英互相切换；英文 README 改指英文指南；顺带更正两处 3.2.0 后过时的「每仓只有一个活动 Run」表述。

## v3.2.0 — 2026-09-26（并行 Run 开关、docs 归档、SKILL.md 瘦身、测试卫生）

> **发布状态**：`@haiyangbg/buildbeat@3.2.0` 已于 2026-09-26 从 `main`（PR #50 内容、release PR #51，merge commit `cda4bd6`，tag `v3.2.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 36233928546，publish 与 verify 双 job 一次 success；所有者授权「推送并发 3.2.0 / 继续」）。独立回读（直连 npmjs.org）：`latest` = 3.2.0、integrity 与发布前本地候选逐字一致、SLSA v1 provenance、隔离安装 `--version` = 3.2.0、裸调用零写入、包内 7 份 `docs/v2/skill` 参考在位且无 `docs/history|releases`、已发布包的 `doctor` 正确报告 `parallel` 模式、`npm audit signatures` 通过；GitHub Release v3.2.0 标 Latest，证据见 [`docs/releases/V3.2.0-RELEASE-EVIDENCE-2026-09-26.md`](docs/releases/V3.2.0-RELEASE-EVIDENCE-2026-09-26.md)。

- 修正 3.1.0 延后的两个 P2：run-config「显式 null 报错」只作用于会静默回落默认值的标量键（`cache: null` 重新表示不开缓存）；YAML 多行列表项恢复修改前的判定与报错原文。
- 并行 Run（开关，默认关）：run 配置 `parallel: true` 的 Work 可与其他同样打开开关的 Work 同时驱动，同一 Work 的 Run 仍互斥；未打开的 Run 照旧独占仓库，两种模式互不越界（独占 Run 持有 `active-run` 全程，并行 Run 只在建立自己的标记时短暂经过它）。共享仓库的 git 写操作（建/删 worktree、分支、`.git/config`）改在短时 `@repo-git` 锁内执行；`gc` 同样回收持有者已死的 `@work` / `@parallel` / `@repo-git` 锁。`doctor` 打印当前模式。
- 测试不再泄漏临时目录：所有测试经 `tests/support/tmp.js` 的 `tempDir()` 建临时目录并在文件结束时删除；一次全量测试从留下 147 个目录（24 MB）降到 0，`tests/v2-test-hygiene.test.js` 禁止测试文件直接调用 `mkdtempSync`。
- lessons 按标题引用：3.0.0 重新编号后指错的数字引用全部改成条目标题，docs 检查拒绝按编号引用。
- `docs/` 归档：历史规划、迭代与试点记录移入 `docs/history/`，各版发布证据移入 `docs/releases/`，相对链接全部重算；npm 包对 `docs/` 改用白名单（docs 检查守住）。
- `SKILL.md` 瘦身：438 行 → 158 行，保留触发条件、驾驶手册、红线摘要与「按需再读」索引；方法论正文（原 §1–§10）原文、原节号不变地移到 `docs/v2/skill/`，随包分发。

## v3.1.0 — 2026-09-26（运行时修复：预算误报、锁残留、台账并发、配置与 YAML 校验）

> **发布状态**：`@haiyangbg/buildbeat@3.1.0` 已于 2026-09-26 从 `main`（PR #47 内容、release PR #48，merge commit `ace9ff5`，tag `v3.1.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 36231006557，publish 与 verify 双 job 一次 success；所有者授权「推送并发 3.1.0 / 继续，CI 过了就发」）。独立回读（直连 npmjs.org）：`latest` = 3.1.0、integrity 与发布前本地候选逐字一致、SLSA v1 provenance、隔离安装 `--version` = 3.1.0、裸调用零写入、`doctor` 只读、`npm audit signatures` 通过；GitHub Release v3.1.0 标 Latest，证据见 [`docs/releases/V3.1.0-RELEASE-EVIDENCE-2026-09-26.md`](docs/releases/V3.1.0-RELEASE-EVIDENCE-2026-09-26.md)。

- YAML 子集解析器不再绊倒常见写法：空的 `[]` / `{}` 可用（非空行内集合仍拒绝，报错提示改成每项一行）；列表项可与所属键同缩进；不带引号的 `- http://x` 按字符串解析，含 `": "` 且前半截不是合法键的项（如 `- echo a: b`）不猜、报错要求加引号；开头的 BOM 被忽略；`007` 这类前导零保留为字符串；「has no value」报错给出改法。修改前的解析器冻结在 `tests/support/yaml-subset-v1.js`，测试断言仓库内它能解析的每个 YAML 新旧结果完全一致；SKILL.md、快速上手（中英）与 run-config 样板同步。

- run-config 在做任何事之前整体校验并一次列出全部问题：必填键、未知顶层键与 worker / envelope 未知字段（给最接近的拼写）、类型与取值（`inheritEnv: yes` 不再静默当 false）、worker 名须被工作流用到、`stopAt` / `entry` 须是工作流步骤、`work` / `run` 的字符与类型（`run: 007` 要求加引号）。缺 `repo` 不再报 Node 内部错误 `paths[1]`。`start` / `resume` / `doctor` / `preflight` / `approve --config` 统一经由它；仓库内全部 run-config 有测试兜底兼容。Workflow 指南与恢复手册（中英）同步。

- 修复会话手修交回时丢额度：`resume --adopt <sha>` 回答一次带 `grants` 的预算停车时，候选虽换成新提交，仍继承请求上的 grants（计划未变的前提下），重验后直接进入下一轮 review，不再在同一轮第二次停 `resume-review`。普通批准仍要求 subject 一致，刷新过的请求仍不继承。抢锁测试在断言失败时也会结束子进程、不再挂住测试进程。

- 修复并发写台账把台账写坏：批准 / 拒绝 / `--adopt` / `stop` / `resume` / 自动取代改为拿到 Run 锁之后才读台账，并在锁内基于新读到的状态判断与写入（此前先读后锁，两个会话几乎同时操作同一 Run 时，后写者会写出重复 seq、断开哈希链，台账从此判定损坏）。台账写入另加兜底：文件在读取后被别人写过就拒绝写入（`changed on disk since it was read`），不写任何字节，重试即可。确定性交错测试在旧代码上复现「hash chain broken」，修复后通过；另有真实多进程并发测试；恢复手册（中英）同步。

- 修复驱动进程被杀后锁残留把 Run 卡死：锁记录持有者（pid、主机、获取时间、命令），`resume` / `stop` / `start` 拿锁时若持有者在本机且进程已不存在即自动回收（锁目录在接管期间始终存在，接管者以「死者世代」命名的独占 claim 竞争、只有一个能赢，赢家再原子替换持有者记录；接管中途死掉的接管者不会把锁卡死；普通拿锁方在此期间一律看到「已被持有」，不会出现两个持有者）；持有者存活、在别的主机或没有记录时不回收，报错写明持有者与下一步。`gc` 同样回收持有者已死的 `active-run` 锁。被 SIGKILL 的真实驱动可直接 `resume` 走崩溃恢复（有集成测试）；恢复手册（中英）同步。

- 修复 `resume --config` 找不到自动编号 Run：精确台账优先，否则选择家族唯一未终态 Run；新增 `--run <RUN-ID>` 显式选择，无候选或多候选时提供诊断。非终态批准提示使用 `buildbeat resume` 并带真实 Run ID，帮助与中英文指南同步；只读步预算提示改为每轮计费。

- 修复预算误停车：非只读步成功不扣次数，真失败与只读 review 轮次继续消耗预算；增加总 attempt 的 3 倍兜底，防止成功循环失控。
- review 到顶且发现阻断问题时提前在 `enter-fix` 一次批准修复、重验、再审；Run/Work review 上限同时放行，过期请求不继承扩额。预算提示显示实际用量、真失败次数及批准/拒绝的含义。
- 事件仅增加可选 `free` / `grants` 字段，旧台账回放保持兼容；默认预算数值不变。放行计划钉在第一条 `BUDGET_EXTENDED` 上，放行中途进程被杀后 `resume` 按原计划补齐。停车提示为英文、带「已用/上限/真失败次数」与批准、拒绝的含义。

## v3.0.1 — 2026-09-09（补丁：示例项目、英文指南）

> **发布状态**：`@haiyangbg/buildbeat@3.0.1` 已于 2026-09-09 从 `main`（PR #41，merge commit `c322ce9`，tag `v3.0.1`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 34370800960，双 job 一次 success；所有者授权「发 3.0.1」）。独立回读（直连 npmjs.org）：`latest` = 3.0.1、integrity 与本地 dry-run 一致、attestation、隔离安装、包内 `example/` 与四篇英文指南在位全过，GitHub Release v3.0.1 标 Latest，证据见 [`docs/releases/V3.0.1-RELEASE-EVIDENCE-2026-09-09.md`](docs/releases/V3.0.1-RELEASE-EVIDENCE-2026-09-09.md)。

- **英文指南补齐四篇**：快速开始、Human Approval、Evidence、故障恢复各加 `.en.md`（与中文逐节对应，互相加语言切换行）；指南索引、docs 总入口、英文 README 指向英文版。快速开始安装注释里的 `BuildBeat v2 runtime` 改为 3.0.0 实际打印的 `BuildBeat runtime`，信封存在性说明去掉版本号。
- **示例项目回来了**：`example/` 现在是虚构单仓项目「简账」跑完一个 Work 的快照——填好的 `AGENTS.md` / `指挥台.md` / `BUILDBEAT.md` / `pm/decisions.md`、通知与 observe 配置样例、带项目环境事实的信封、完整的 `delivery/work/WORK-EXPORT-DATE-FILTER/`（intent / plan / run-config / workflow 副本）以及运行时真跑一遍得到的 `decisions.jsonl` 与 `run-record.json`，外加应用本体与真实 `npm test`。随 npm 包与 Claude 插件分发；`tests/example-firstrun.test.js` 锁住工件一致性并把原样拷贝再跑到合并决定。README、docs 索引、SKILL §8.3 指向它。

## v3.0.0 — 2026-09-09（大版本：只剩一个产品，v1 移除）

> **发布状态**：`@haiyangbg/buildbeat@3.0.0` 已于 2026-09-09 从 `main`（PR #37，merge commit `0289415`，tag `v3.0.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 34362068004；publish 一次成功，verify 因 npm 异步处理约 6 分钟才可见而首次超时、版本可见后重跑成功；所有者授权「合并，然后发 3.0.0」）。独立回读（直连 npmjs.org）：`latest` = 3.0.0、integrity 与本地 dry-run 一致、attestation、隔离安装只有 `buildbeat` 一个可执行文件、裸调用零写入、包内无 v1 面全过，GitHub Release v3.0.0 标 Latest，证据见 [`docs/releases/V3.0.0-RELEASE-EVIDENCE-2026-09-09.md`](docs/releases/V3.0.0-RELEASE-EVIDENCE-2026-09-09.md)。

> **3.0.0（破坏性变更）**：v1 已移除。需要 v1 文件总线或 `buildbeat doctor/init/adopt/upgrade` 的项目请停留在 2.0.2；3.0.0 起仓库与包只描述一个产品。

- **可执行文件只剩 `buildbeat`**：它就是运行时（原 `buildbeat-v2`）；`buildbeat-v2` 与 `solobaton` 两个入口删除。新增 `buildbeat --version`。所有文档、模板、信封、`overview` / `inbox` / 通知里可复制的下一句命令统一改名。
- **删除 v1 面**：生命周期 CLI 源码（`src/cli.js`、`constants.js`、`doctor.js`、`planner.js`、`project.js`、`upgrader.js`、`writer.js`）、文件总线模板（`templates/AGENTS.md` 等根模板、`pm/NOW.md`、当期看板、`pm/status/`、`pm/changes/`、`templates/scripts/` 五个脚本、`.claude/agents/reviewer.md`）、教学沙盘 `example/`、`docs/CLI.md`、`docs/CHECKS.md`、`docs/LEGACY-V1.16-MIGRATION.md`、`docs/v2/guide/08-migration-v1.md`、`legacy-four-gates` 风险预设，以及它们的测试（`tests/cli.test.js`、`test-scripts.sh`、`skill-only.test.sh`、`tests/fixtures/`）。保留并改写为运行时口径的模板：`pm/decisions.md`、`pm/adr/`、`standards/`、`contracts/PROTOCOL.md`、`ARCHITECTURE.md`、`gitignore.template`。
- **SKILL.md 重写为单一产品**：§3 项目文件布局、§4 十一条协作规则（指向 `templates/v2/AGENTS.md`）、§5 风险预设决定人批点、§6 三个仪式与读数表、§8 Bootstrap 只剩一条路（含验证命令与 worker 工具自查、通知一问）、§8.5 接管存量项目按 `allowedPaths` 划边界；frontmatter 触发词去掉旧名。`lessons.md` 22 条：只对文件总线成立的 3 条删除，其余解药改指运行时机制并重新编号。
- **文档**：README 中英去掉 v1 折叠段与迁移指南链接；能力矩阵改为三个可用面；docs 索引、发布手册、贡献指南、tests/README、插件 README 同步；RFC-0001 §6 与 RFC-0003 预设表加 2026-09-09 生效修订注，正文保留。带日期的历史文件（试点、路线、发布证据、`CHANGELOG-v1.md`）原样留在仓库，不进包。
- **守卫**：`tests/check_docs.py` 重写——删除面的路径不得回归（`REMOVED_PATHS`），现行文档不得再出现旧可执行文件名、旧产品名、文件总线与固定 Gate 词汇；`package.json` 只允许一个 bin；插件版本 0.2.2 → 0.3.0（不再链接 `example/`）。CI 去掉文件总线脚本套件，作业名不变；发布 workflow 只探测 `buildbeat`。
- **体积**：npm 包 137 → 85 个文件，压缩约 340 kB → 212 kB，解压约 963 kB → 578 kB。

- **CHANGELOG 拆分**：v1 系列条目（v1 ～ v1.21.0，约 55 kB，占原文件近三分之二）原文不改地移到仓库根 [`CHANGELOG-v1.md`](https://github.com/HaiYangBG1/BuildBeat/blob/main/CHANGELOG-v1.md)，根 `CHANGELOG.md` 只保留 v2 系列并在末尾指向它；新文件不在 `package.json` 的 `files` 里，不随 npm 包分发，`tests/pack-firstrun.test.sh` 断言包内有 `CHANGELOG.md`、没有 `CHANGELOG-v1.md`。版本史仍只在 CHANGELOG 一处维护，只是按大版本分了两个文件。

## v2.0.2 — 2026-09-09（补丁：npm 包不再携带历史文档）

> **发布状态**：`@haiyangbg/buildbeat@2.0.2` 已于 2026-09-09 从 `main`（PR #33，merge commit `a077367`，tag `v2.0.2`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 34351668694，双 job success；所有者授权「发 2.0.2」）。独立回读（直连 npmjs.org）：`latest` = 2.0.2、integrity 与本地 dry-run 一致、attestation、隔离安装、`doctor` 有界 JSON、包内 `docs/` 24 个文件且无历史文档全过，GitHub Release v2.0.2 标 Latest，证据见 [`docs/releases/V2.0.2-RELEASE-EVIDENCE-2026-09-09.md`](docs/releases/V2.0.2-RELEASE-EVIDENCE-2026-09-09.md)。

- **npm 包不再携带历史文档**：`package.json` 的 `files` 显式排除发布证据、迭代记录、阶段试点、路线与规划类文件（`docs/*-RELEASE-EVIDENCE-*.md`、`V2-ITERATION-*`、`PHASE*`、`V2-PLAN/PROPOSAL/DECISIONS`、`ROADMAP`、`EXECUTION-PLAN`、`CLI-STRATEGY/PILOT`、`docs/v2/M1/M2/M4-*` 与 v2 长文），它们只留在仓库；现行文档（总入口、v1 CLI 合同与检查、能力矩阵、迁移、发布手册、RFC/SPEC、十件套指南）照常分发。包内 `docs/` 从 61 个文件降到 24 个，压缩包约 497 kB → 362 kB，解压约 1.3 MB → 1.0 MB。安装目录里现行文档指向历史文件的链接会落空，`docs/README.md` 已说明去 GitHub 看。回归：`tests/pack-firstrun.test.sh` 新增两条断言——每份现行文档都在包内、历史文件一个都不在。运行时行为不变。

## v2.0.1 — 2026-09-06（补丁：合同与文档同步、`env:` 透传修复、v2 模板与首跑回归、首页重写）

> **发布状态**：`@haiyangbg/buildbeat@2.0.1` 已于 2026-09-06 从 `main`（PR #29，merge commit `4b2362f`，tag `v2.0.1`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 34032278315，双 job success；所有者授权「发」）。独立回读（直连 npmjs.org）：`latest` = 2.0.1、integrity 与本地 dry-run 一致、attestation、隔离安装、`doctor` 有界 JSON、包内 `templates/v2/envelope/` 全过，GitHub Release v2.0.1 标 Latest，证据见 [`docs/releases/V2.0.1-RELEASE-EVIDENCE-2026-09-06.md`](docs/releases/V2.0.1-RELEASE-EVIDENCE-2026-09-06.md)。

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

> **发布状态**：`@haiyangbg/buildbeat@2.0.0` 已于 2026-09-05 从 `main`（PR #22，tip `95e780e`，tag `v2.0.0`）经 OIDC Trusted Publishing 发布到 dist-tag **`latest`**（run 33974396871，双 job success；所有者授权「正式发布」）。独立回读（直连 npmjs.org）：`latest` = 2.0.0、integrity、attestation、隔离安装、`doctor` 有界 JSON 全过，GitHub Release v2.0.0 标 Latest，证据见 [`docs/releases/V2.0.0-RELEASE-EVIDENCE-2026-09-05.md`](docs/releases/V2.0.0-RELEASE-EVIDENCE-2026-09-05.md)。

- **内容与 `2.0.0-beta.5` 同源**（迭代 01～09 的全部 v2 运行时、Skill §0.5 驾驶手册、`templates/v2/`、十件套指南、lessons #1–#25），外加 README 中英文的「当前主线是 v2」段与 `docs/CLI.md` 的 2.0.0 状态行。
- **对拷出项目意味着什么**：v1 文件总线、`buildbeat` 生命周期命令（`doctor` / `init` / `adopt` / `upgrade` / `version`）与安全边界**不变**，schema 仍是 2；`npm install --global @haiyangbg/buildbeat@latest` 现在同时给出 `buildbeat` 与 `buildbeat-v2`。骨架版本仍是 `v1.21`（模板未变，`buildbeat upgrade` 对 1.21 骨架报 up-to-date，不需要 `--major`）；manifest 里的 `cliVersion` 只是记录，不触发升级。v2 运行时是可选叠加：按 `docs/v2/guide/08-migration-v1.md`（已于 3.0.0 移除）建 `delivery/work/` 与 run 配置即可，不动现有 `pm/` 与 `contracts/`。
- **分发口径**：`latest` 从 1.21.0 切到 2.0.0；`next` 保留给后续预发布；旧 `solobaton` 包不变。

## v2.0.0-beta.5 — 2026-09-05（迭代 09：预算是刹车、故障分开算、成本看得见）

> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.5` 已于 2026-09-05 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33972774150，双 job success；所有者授权「发，并且迭代5轮可以直接切换到线上版本了」）；`latest` 保持 v1.21.0。独立回读（直连 npmjs.org）：dist-tag 路由、integrity、attestation、隔离安装、`doctor` 有界 JSON 全过，证据见 [`docs/releases/V2.0.0-BETA.5-RELEASE-EVIDENCE-2026-09-05.md`](docs/releases/V2.0.0-BETA.5-RELEASE-EVIDENCE-2026-09-05.md)。所有者本机 CLI 已从源码链接切回正式包。
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
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.4` 已于 2026-09-03 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33728863042，双 job success；所有者授权「发布 beta.4 吧，授权也一起」）；`latest` 保持 v1.21.0。独立回读（直连 npmjs.org）：dist-tag 路由、integrity、attestation、隔离安装、`doctor` 有界 JSON 全过，证据见 [`docs/releases/V2.0.0-BETA.4-RELEASE-EVIDENCE-2026-09-03.md`](docs/releases/V2.0.0-BETA.4-RELEASE-EVIDENCE-2026-09-03.md)。

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
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.3` 已于 2026-09-01 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33460544343，双 job success）；`latest` 保持 v1.21.0。独立回读（直连 npmjs.org）：dist-tag 路由、integrity、签名+attestation、隔离安装全过，证据见 [`docs/releases/V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md`](docs/releases/V2.0.0-BETA.3-RELEASE-EVIDENCE-2026-09-01.md)。

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
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.2` 已于 2026-08-28 经 OIDC Trusted Publishing 发布到 dist-tag `next`（run 33175013599，双 job success）；`latest` 保持 v1.21.0。独立回读：dist-tag 路由、integrity、SLSA provenance、隔离安装全过，证据见 [`docs/releases/V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md`](docs/releases/V2.0.0-BETA.2-RELEASE-EVIDENCE-2026-08-28.md)。

- **fix(v2) 范围门中文路径误拦**：git `core.quotepath` 默认把非 ASCII 路径转义为带引号的八进制串，`listChangedPaths` 直接喂给 allowedPaths 前缀检查导致范围内中文文件被判越界（真实事故：试点工作区 `RUN-META-V2-01` 被 `pm/登录二期看板.md` 阻断）。读回改用 `core.quotepath=off`，中文路径永久回归进 `tests/v2-invariants.test.js`

## v2.0.0-beta.1 — 2026-08-28

> 主题：BuildBeat v2 首个 Beta——确定性内核 + Agent Loop Runtime。事件溯源台账（hash 链、损坏截断、终态压实进 Git 面）、Policy 门（8 算子三值逻辑、`UNVERIFIED` 永不当 PASS）、隔离 Workspace（push 物理封禁、`allowedPaths` 越界即停、Reviewer 只读快照强制）、Shell Adapter 厂商中立接任意 CLI Agent（codex 实证）、digest 绑定人批与 `APPROVAL_STALE`。MVP 承诺兑现：Build–Verify–Fix–Review 自动闭环，停在合并决定，带证据交人。
> **发布状态**：`@haiyangbg/buildbeat@2.0.0-beta.1` 已于 2026-08-28 经 GitHub Actions OIDC / Trusted Publishing 发布到 dist-tag `next`；`latest` 保持 v1.21.0，v1 CLI 与文件冻结随包分发（脚手架束钉 `v1.21`）。v2 入口为独立 bin `buildbeat-v2`。registry exact artifact、SLSA provenance、dist-tag 路由、隔离安装、签名审计均已独立回读，证据见 [`docs/releases/V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md`](docs/releases/V2.0.0-BETA.1-RELEASE-EVIDENCE-2026-08-28.md)。
> **试点证据**：self-host（RUN-SELF-001）+ 两个外部真实项目（pilot-backend RUN-PILOT-EXT-01 全自动 5.2 分钟到合并决定；pilot-app 看板积压含完整 reviewer 阻断→fixer 修复闭环），六退出指标全达标；见 `docs/v2/M4-*.md`。

- **observe v0**（RFC-0003 §8 冻结契约的实现）：drift-check/live-status 类探针接为 Evidence Provider（采不到即 `unverified`，同一 Evidence Contract 与链校验台账）；bands log→只读诊断→Intent 草稿三层分层响应；草稿只入队 Git 面绝不自动执行；`observe triage` 人分诊，`dismiss` 回调阈值防告警疲劳；分诊记忆活在 Git 面，runtime 可删（不变量 23 有测试）
- **文档十件套**（`docs/v2/guide/`）：快速开始 / Workflow / Policy / Adapter / Worker 合同 / Evidence / Approval / v1 迁移半天手工 runbook / 安全边界 / 故障恢复
- **`buildbeat-v2 metrics`**：本地只读六指标；行为 evals 九场景卡进 `npm test` 单入口
- **v1 迁移**：半天手工 runbook（不猜旧状态、单向迁移、禁止双写）；`legacy-four-gates` 风险预设保留 v1 四 Gate 完整形态
- **v1 冻结的两处诚实修正**（prepublish 门抓出）：manifest `cliVersion` 校验接受 prerelease（否则 v1 CLI 装在 beta 包里自坏）；`SCAFFOLD_VERSION` 钉死 `v1.21` 字面量、与包版本解耦——脚手架内容束未变，存量安装不应看到虚构的跨大版本升级
- **发布道**：publish workflow 增加 prerelease 通道（prerelease tag 只能从其发布分支的 origin tip 发、强制 dist-tag `next`、verify 回读 dist-tag 路由；stable 通道 main-only 原样），配对契约进 `tests/publish-workflow.test.js` 永久回归

## v1 系列（2026-06-10 ～ 2026-08-25）

v1 ～ v1.21.0 的条目原文见 [`CHANGELOG-v1.md`](https://github.com/HaiYangBG1/BuildBeat/blob/main/CHANGELOG-v1.md)（仅仓库内，不随 npm 包分发）。
