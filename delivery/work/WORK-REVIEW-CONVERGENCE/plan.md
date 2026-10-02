# Plan:review 收敛判断认得出同一问题 + 3.3.0 文档补齐(WORK-REVIEW-CONVERGENCE)

## 修改范围

`src/v2/runtime/findings.js`(新增判定函数)、`src/v2/runtime/orchestrator.js`(`reviewNotConverging` 改用它;`src/v2/cli/run.js` 一处过时注释)、`tests/`、`docs/v2/guide/`(工作流、审批,中英)、`docs/RELEASING.md`、`docs/releases/V3.3.0-RELEASE-EVIDENCE-2026-10-02.md`、`lessons.md`、`CHANGELOG.md`、本 Work 目录。
按 A→C 顺序做,每部分独立提交。

## A. 「同一问题」判定

1. `findings.js` 新增并导出 `sameIssue(a, b)`,两条 finding 满足任一即视为同一问题:
   - 指纹相同;
   - **文件锚点集合相同且非空,且描述相似度 ≥ 0.5**;
   - 描述相似度 ≥ 0.6。
   其中「文件锚点」= summary 里形如 `dir/name.ext` 或常见源码扩展名的路径,去掉行号、按字典序去重;「描述」= summary 去掉文件锚点、数字与标点空白后转小写;「相似度」= 字符二元组的 Dice 系数(中英文通用,无外部依赖)。严重度不参与(同一问题从 P1 升到 P0 也算又出现)。
2. `reviewNotConverging`:「earlier」从指纹集合改为之前各轮的阻断 finding 列表(已 dismiss 的仍排除);本轮每条阻断 finding 与之逐条比较,命中即算又出现。理由列出「本轮指纹 ← 之前第 N 轮指纹」。「阻断数比上一轮多」的规则不变。
3. 阈值来源写进代码注释与 notes:回放本机 4 个仓 161 轮 review,`同锚点且 ≥0.5` 或 `≥0.6` 命中真实重复 3 次(2 个 Run),无关 finding 之间的最高相似度 0.56,无误报。
4. 测试:`tests/v2-findings-same-issue.test.js`(判定本身,通用示例文字);`tests/v2-review-convergence.test.js` 补「换说法再报」一例。原有测试不改。

## B. 文档

1. 工作流指南(中英)、审批指南(中英)、`docs/v2/skill/03-collaboration-rules.md`、模板与示例 `AGENTS.md` 里「修过的 finding 又出现(同指纹…)」改为「同一问题又出现(同指纹,或描述相近)」;示例 `workflow.yaml` 与预设逐字一致不受影响。
2. `lessons.md`:教训 14 解药改为现行机制(review 上限 `reviewRoundsPerWork` 默认 6、不收敛才停人、分诊门按项目风险开);新增教训 23「中途审批点被驾驶会话自己批,同一个问题换个说法就认不出」,症状/根因/解药三段,数字来自 3.3.0 与本 Work 的回放。
3. `src/v2/cli/run.js` 中「the preset's two review rounds」注释改为不再提预设轮数。

## C. 发布文档

1. `docs/RELEASING.md` 候选检查:候选包用 Node 24 + npm 11.19.0 打包(与 `publish.yml` 一致)再取 integrity;做不到时以解压后的 tar 的 sha256 比对,并在证据里写明。发布后检查清单加一条:`which -a buildbeat` 列出的每一份全局安装都换到新版。
2. 3.3.0 发布证据「切换」一行更正:当时只更新了 Homebrew 下的一份,版本管理器下的一份 2026-10-02 补装到 3.3.0。
3. CHANGELOG `Unreleased`:一条「收敛判断认得出换了说法的同一问题」,一条文档更正。

## 风险

- 相似度阈值来自一份 161 轮的样本,可能对其他项目偏松或偏紧:偏松的后果是多停一次人(批准即继续,不损失工作),偏紧则回到 3.3.0 的行为;两种后果都有界。
- 不改指纹,所以已有裁决台账、`findings list` 输出、dismiss 抑制都不受影响。

## 测试方法

verify 步跑 `npm test && npm run check:docs && npm run test:plugin && npm run test:pack-firstrun && npm run test:envelope`;只读 reviewer 独立审一轮。

## 回滚方式

Run 分支不合并即无影响;A–C 各自独立提交,可单独 revert。
