# Intent:评审剩下的小项一次收掉(WORK-REVIEW-LEFTOVERS)

## 为什么做

评审清单只剩五个小项,各自不大,但都在持续制造摩擦:

1. **不带值的开关参数会报错**:`overview --json`、`gc --apply`、`gc --force`、`watch --once` 必须写成 `--json true` 才行,单写 `--json` 报「bad arguments near: --json」;缺值时的报错也不说是哪个参数缺值。
2. **`drive()` 一个函数 459 行**:进入检查、准备输入、执行或复用证据、结果分类、路由全挤在一起,「这一步是不是 review」的判断还在两处各写一遍;每次改预算、锁、审查逻辑都要在这一大段里找位置。
3. **CodeQL 不扫 `v2`**:日常开发都在 `v2` 上,CodeQL 只在 `main` 的 PR / push 与每周定时跑,`v2` 上的改动要等开 PR 到 `main` 才被扫。
4. **`pilot/` 早该归档**:这是 M-1 时期的脚本驱动试点(`loop.sh`,`metrics.md` 停在 2026-08-28),早已被运行时取代,却还在 CI 的「Script behavior」作业和 `prepublishOnly` 里跑;而真正随包发给用户的 shell 脚本——信封 `worker.sh`——反而没有 shell 级测试(macOS 自带 bash 3.2)。
5. **7 份指南只有中文**:`00-how-to-talk`、`02-workflow-guide`、`03-policy-guide`、`04-adapter-guide`、`05-worker-contract`、`09-security-boundaries` 与指南索引 `README.md` 没有英文版,英文读者从 README 进来到这里就断了。

## 目标

- 开关参数可以单写(`--json`、`--apply`、`--force`、`--once`),`--json true` 这类旧写法继续有效;缺值报错写明是哪个参数;
- `drive()` 拆成几个有名字的阶段函数,review 步判定只有一处;**行为零变化**;
- CodeQL 对 `v2` 的 push 也做分析;
- `pilot/` 归档到 `docs/history/pilot/`,不再进 CI 与发布前检查;「Script behavior」作业(`main` 保护要求的检查名不变)改为在 macOS 与 Linux 上测信封 `worker.sh`;
- 7 份指南各有英文版,中英互相切换,指南索引的英文版列出英文链接。

## 非目标

- 不改运行时行为、事件、配置语义(A 只放宽参数写法);
- 不改信封 `worker.sh` 本身(只加测试;若测试发现缺陷,记入 notes 另议);
- 不处理 Dependabot 的 PR #45(它也改 `codeql.yml`,但改的是 action 版本,与本 Work 改的触发分支不在同一处);
- 不 merge、不 push、不发版。

## 验收条件

- 参数:单写与 `true` 写法结果相同(`overview --json`、`gc --apply`、`metrics --json` 等),缺值报错点名参数;现有 CLI 测试不改仍通过;
- `drive()`:拆分后主体不超过 100 行;**不修改任何现有测试**的情况下全量测试通过;review 步判定只有一个函数;
- CodeQL:`codeql.yml` 的 push 分支包含 `v2`,`actionlint` 通过;
- 归档:`pilot/` 移入 `docs/history/pilot/`(`git mv`),指向它的链接全部有效;`test:pilot` 与 `pilot-loop.test.sh` 退出 CI 与 `prepublishOnly`;新增 `tests/envelope-worker.test.sh` 覆盖工具缺失 → 75、写入步提交改动并透传退出码、只读步落输出且不覆盖工具自写的输出、未知角色 → 64、prompt 作为最后一个参数传入,在 CI 的 macOS(bash 3.2)与 Linux 上都跑;
- 翻译:7 份英文版与中文版逐节对应,中英双向切换链接,docs 检查全绿;
- `npm test`、`npm run check:docs`、`test:plugin`、`test:pack-firstrun`、`npm publish --dry-run` 全绿;CHANGELOG `Unreleased` 同步。

## 止损线

- 最多 2 个 Run;review 累计最多 4 轮(`budgets.reviewRoundsPerWork: 4`);
- 墙钟超过 6 小时未到合并决定,停下先问人是否拆分。
