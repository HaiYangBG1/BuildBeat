# Plan:把评审剩下的问题一次收干净(WORK-REVIEW-CLEANUP)

## 修改范围

`src/v2/`、`tests/`、`docs/`、`SKILL.md`、`templates/v2/`、`package.json`(仅 `files`)、`README.md` / `README.en.md`(仅链接路径)、
`plugins/buildbeat/`(仅在 SKILL 拆分需要时)、`CHANGELOG.md`。按 A→F 顺序做,每部分独立提交,便于审查与回滚。

## A. 两个延后的 P2

1. `src/v2/cli/run-config-check.js`:「显式 null」规则只作用于计划里定义为标量的键——`base`、`entry`、`riskPreset`、`stepTimeoutMs`、`maxAttemptsPerStep`;
   列表键仍由既有的「必须是列表」规则处理;`cache`、`budgets`、`envelope`、`reviewTriage`、`supersede`、`stallAfterMs` 恢复各自原有处理(`cache: null` = 不开缓存)。
   测试:`cache: null` 通过且加载后无缓存;`base: null` 仍报错。
2. `src/v2/engine/yaml-subset.js`:新的「`key: ` 开头才是映射」判定只用于**单行**列表项;多行列表项恢复修改前的判定与报错原文。
   测试:多行项首行为 `http://x` 时,新旧解析器报错完全相同(用 `tests/support/yaml-subset-v1.js` 对比)。

## B. 并行 Run(开关,默认不变)

1. run-config 新键 `parallel`(布尔,默认 `false`),加入 run-config 校验的已知键与类型检查;`doctor` 打印当前模式。
2. 锁模型(`orchestrator.js` 的 `withRunLocks` 一处决定,沿用现有带持有者的锁与死锁回收):
   - **独占(默认)**:同现在——持有 `active-run` 锁驱动全程;拿到后再确认没有存活的并行标记(`parallel-<RUN>.lock`),有则释放并报「另一个 Run 在跑」,列出持有者。
   - **并行**:先拿 `work-<WORK>` 锁(同一 Work 互斥);再**短暂**拿 `active-run` 作闸门,建立自己的 `parallel-<RUN>` 标记后立即释放闸门;驱动全程持有 `work-<WORK>` 锁与标记,结束时释放。
   - 于是:独占 Run 在跑时并行 Run 过不了闸门;并行 Run 在跑时独占 Run 拿到闸门后看到存活标记而退出;持有者已死的标记按现有规则回收,不挡路。
3. 共享仓库的 git 写操作(建/删 worktree、建分支、写 `extensions.worktreeConfig`)在一个短时 `repo-git` 锁内执行,拿不到时最多重试 10 秒,避免两个并行 Run 同时写 `.git/config` / `index.lock`。
4. `start` 被挡时的提示与 `status` / `overview` 能显示并行 Run;不改台账事件。
5. 测试(新增 `tests/v2-parallel-runs.test.js`,真实 CLI + 脚本 worker 睡眠):两个开开关的不同 Work 的 Run 执行区间重叠;同 Work 第二个 Run 被挡;独占在跑时并行被挡、并行在跑时独占被挡;死标记不挡路;不开开关时两个 Work 仍排队(与现状一致)。
6. 文档:run-config 样板注释、Workflow 指南 run 配置一节说明开关与适用前提(测试互不抢端口/数据库);CHANGELOG。

## C. 测试不再泄漏临时目录

1. 新增 `tests/support/tmp.js`:`tempDir(prefix)` 建目录并登记,模块级 `after()` 在该测试文件结束时统一删除。
2. 32 个未清理的测试文件把 `mkdtempSync(join(tmpdir(), …))` 换成 `tempDir(…)`(已自行清理的文件不动)。
3. 验证:记录 `npm test` 前后 `$TMPDIR` 下 `bb-*` 目录数,新增为 0,写进本 Work 的 `notes.md`;加一条测试守住「测试文件里不再直接调用 `mkdtempSync(join(tmpdir()`」(`tests/support/` 除外)。

## D. lessons 按标题引用

1. `src/v2/runtime/decisions.js`、`src/v2/runtime/metrics.js`、`src/v2/presets/policies/ui-render-gate.yaml`、`SKILL.md` 里按编号的引用改为按标题引用(核对每处实际对应的条目,`decisions.js` 对应「读过期 race」,`metrics.js` 按注释原意找到对应条目或删去编号)。
2. 在 docs 检查里加一条:`src/`、`templates/`、`SKILL.md`、`docs/v2/guide/` 不得出现 `lessons #N` / `教训 N` 这类按编号引用。

## E. `docs/` 归档与包白名单

1. 历史文档移入 `docs/history/`:`V2-ITERATION-*`、`V2-PLAN.md`、`V2-PROPOSAL.md`、`V2-DECISIONS.md`、`V2-D2-DECISION-CARD.md`、`EXECUTION-PLAN.md`、`PHASE*`、`CLI-PILOT-*`、`CLI-STRATEGY-*`、`ROADMAP.md`、`BuildBeat v2*.md`;
   各版发布证据移入 `docs/releases/`。`git mv` 保留历史。
2. 全仓相对链接同步(README、CHANGELOG、RELEASING、CAPABILITY-MATRIX、docs/README、各证据互链等);CHANGELOG 历史条目只改链接路径不改文字。
   RELEASING 的「发布后同步清单」与当前状态段落写新路径;docs 检查中涉及这些路径的规则同步。
3. `package.json` 的 `files` 改为白名单(`docs/README.md`、`docs/CAPABILITY-MATRIX.md`、`docs/RELEASING.md`、`docs/v2/` 及其现有排除项等,以当前包内实际文件为准),
   验收:`npm pack --dry-run --json` 文件清单与 3.1.0 包逐一相同(把 3.1.0 包清单写进测试数据或 `test:pack-firstrun` 对比)。

## F. `SKILL.md` 瘦身

1. `SKILL.md` 保留:frontmatter、§0 何时用、§0.5 驾驶手册(用户一句话 → 调什么、读法、最小样板)、红线摘要(每条一句)、「按需再读」索引表。目标 ≤ 200 行。
2. §1 四根支柱、§2 工作包与视角、§3 文件布局、§4 协作规则/任务包/审批分层/决策包、§5 节奏、§6 三个仪式与读数、§7 红线全文、§8 Bootstrap、§8.5 接管存量、§9 模板索引、§10 教训
   原文移入 `docs/v2/skill/` 下的参考文件(按主题分若干篇,内容不改写,只调整标题层级与相对链接),`SKILL.md` 索引逐一链接,说明「什么时候读哪篇」。
3. 插件经符号链接取 `SKILL.md` 与 `docs/`,确认 `test:plugin` 通过;docs 检查的活跃文档规则若引用了被移动的段落,同步到新文件。
4. 验证:`SKILL.md` 行数;移出内容与原文逐段比对(除标题层级与链接外无差异),写进 `notes.md`。

## 风险

- B 是行为新增:只在显式打开开关时生效,默认路径的代码与现有测试不变;并行模式的正确性靠闸门 + 标记 + 同 Work 锁三件,集成测试逐一覆盖。
- E 的链接改动面广:靠 docs 检查的相对链接校验与包清单对比兜底。
- F 改变了会话默认读到的内容:只移动不改写,索引写清触发场景,红线摘要留在 `SKILL.md`。

## 测试方法

verify 步跑 `npm test && npm run check:docs && npm run test:plugin && npm run test:pack-firstrun`(E、F 直接影响打包与插件);本地另跑 `test:pilot` 与 `npm publish --dry-run`。

## 回滚方式

Run 分支不合并即无影响;A–F 各自独立提交,可单独 revert。
