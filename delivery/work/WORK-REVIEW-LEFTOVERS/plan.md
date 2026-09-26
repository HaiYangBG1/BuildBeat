# Plan:评审剩下的小项一次收掉(WORK-REVIEW-LEFTOVERS)

## 修改范围

`src/v2/cli/run.js`(`parseFlags`、用法文本)、`src/v2/runtime/orchestrator.js`(`drive()` 拆分)、`.github/workflows/`(CodeQL 分支、CI 脚本作业)、
`pilot/` → `docs/history/pilot/`、`tests/`、`docs/`、`package.json`(仅 scripts)、`CONTRIBUTING.md`、`README.md` / `README.en.md`(仅指南链接)、`CHANGELOG.md`。
按 A→E 顺序做,每部分独立提交。

## A. 开关参数

1. `parseFlags`:已知的布尔开关 `json`、`apply`、`force`、`once` 可单写(视为 `true`);后面紧跟 `true` / `false` 时照旧取该值;其余参数仍必须带值,缺值报 `--<name> needs a value`,多余的裸词报 `unexpected argument: <word>`。
2. 用法文本改为 `[--json]`、`[--apply]`、`[--force]`、`[--once]`;`gc` 的计划提示改为「rerun with --apply」;指南里的 `--apply true` 等写法保留(仍有效),不强制改。
3. 测试:`overview --json` 与 `--json true` 输出相同;`gc --apply` 执行;`--config` 缺值报错点名;布尔开关后跟 `false` 时为假。

## B. `drive()` 拆分(行为零变化)

1. 新增 `isReviewStep(step, stepDef)`,替换 `workReviewBudget` 与 findings 分支里重复的 `step === "review" || stepDef.worker === "reviewer"`。
2. `drive()` 的循环体按现有顺序拆为若干阶段函数(名称示意):`checkBeforeStep`(终态、stopAt、adapter、Work 级 review 上限、pre 策略、预算)、`stepInput`(锚定审查/发现清单输入)、
   `executeOrReuse`(缓存复用或执行 worker、落证据)、`recordStepResult`(infra 判定、只读快照比对、越界检查、候选固定、post 策略)、`routeAfterStep`(发现分诊与预算一问、结算与转移)。
   各阶段返回「继续到下一步 / 停下」;`drive()` 只剩循环与阶段调用,不超过 100 行。
3. 不改任何现有测试;以全量测试(含预算、锁、并行、台账竞态、审查循环、发布车道、首跑与打包首跑)作为行为不变的证据。

## C. CodeQL 扫 `v2`

`.github/workflows/codeql.yml` 的 `push.branches` 加 `v2`(`pull_request` 仍只针对 `main`,定时不变);`actionlint` 通过。

## D. 归档 `pilot/`,脚本作业改测信封

1. `git mv pilot docs/history/pilot`(含 `loop.sh`,作为历史文件不再执行);`tests/pilot-loop.test.sh` 一并移入 `docs/history/pilot/`。
2. 指向 `pilot/` 的链接(RFC-0001/0002/0003、SPEC-0001 的「需求来源」、`docs/README.md` 等)按新位置重算;历史文件内部互链一并修正。
3. `package.json`:删除 `test:pilot`,新增 `test:envelope`(`bash tests/envelope-worker.test.sh`),`prepublishOnly` 以它替换 `test:pilot`。
4. 新增 `tests/envelope-worker.test.sh`(bash 3.2 兼容写法),在一次性 git 仓库里用桩工具驱动 `templates/v2/envelope/worker.sh`:
   工具不在 PATH → 75;builder / fixer 有改动时机械提交(提交信息含 run id 与 attempt)并透传工具退出码;无改动不提交;
   reviewer 把工具 stdout 落到 `$BUILDBEAT_OUTPUT`,工具自己写了该文件则不覆盖;未知角色 → 64;缺参数 → 64;`$BUILDBEAT_PROMPT` 的内容作为最后一个参数传给工具。
   同时断言 `example/delivery/envelope/worker.sh` 与模板逐字相同(示例是模板的拷贝)。
5. CI:「Script behavior (macos-latest / ubuntu-latest)」作业名不变,步骤改跑 `tests/envelope-worker.test.sh`;静态检查作业的 `bash -n` / `shellcheck` 范围去掉 `pilot/*.sh`,加上 `templates/v2/envelope/*.sh`。
6. `docs/RELEASING.md` 候选检查、`CONTRIBUTING.md`、`tests/README.md`、docs 检查中对 `test:pilot` 的要求同步为 `test:envelope`。

## E. 7 份指南的英文版

1. 新增 `00-how-to-talk.en.md`、`02-workflow-guide.en.md`、`03-policy-guide.en.md`、`04-adapter-guide.en.md`、`05-worker-contract.en.md`、`09-security-boundaries.en.md`、`README.en.md`(均在 `docs/v2/guide/`),逐节对应中文原文,命令、配置键、代码块原样保留,链接优先指向已有的英文版。
2. 中英文件顶部互加语言切换行(与现有 `01-quickstart` / `07` / `10` / `11` 的写法一致);`README.md` / `README.en.md` 若链接了这些指南,英文 README 改指英文版。
3. docs 检查全绿(相对链接、双语入口规则)。

## 风险

- B 是纯重构:唯一的正确性依据是现有测试不改而全过,因此 B 期间不碰测试文件;若发现某路径没有测试覆盖而无法确认等价,先在 notes 记录并补测试(单独提交,说明原因)。
- D 的「Script behavior」作业名是 `main` 分支保护要求的检查名之一,只改步骤不改名。
- E 是翻译:以中文为准,术语与既有英文指南一致(Work、Run、candidate、finding、triage、adopt 等不译)。

## 测试方法

verify 步跑 `npm test && npm run check:docs && npm run test:plugin && npm run test:pack-firstrun && bash tests/envelope-worker.test.sh`;本地另跑 `actionlint`、`shellcheck` 与 `npm publish --dry-run`。

## 回滚方式

Run 分支不合并即无影响;A–E 各自独立提交,可单独 revert。
