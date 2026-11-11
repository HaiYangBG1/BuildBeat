# 路径里不再带 v2

## 目标

仓库里的 `src/v2/`、`docs/v2/`、`templates/v2/` 和 `tests/v2-*.test.js` 是从"第二代"过渡时留下的名字。第一代早就删了，现在只有一个产品，新来的人看到 `v2` 会去找 `v1`。趁 6.0.0 这个本来就不兼容的主版本一起改掉，以后不用再为它断一次。

做完后：`src/`、`docs/guide/`、`templates/` 下直接是内容，测试文件名不带 `v2-` 前缀，文档里说到开发分支时不再提 `v2` 分支。行为不变。

## 起因

WORK-CLEAN-START 的工作说明把这件事列为"三段合入后、发版前另做"。2026-11-11 准备发 6.0.0 时问所有者要不要趁这次一起改，所有者选：「这次一起改」。

- follows: WORK-CLEAN-START

## 已核实的现状（2026-11-11，`4e916a6`）

**已确认**

- 带 `v2` 的路径：`src/v2/` 下 33 个文件，`docs/v2/` 下 27 个（26 份指南和 `SPEC-0001-events-v1.md`），`templates/v2/` 下 11 个，`tests/v2-*` 57 个（当天 `git ls-files`）。除 `delivery/work/` 里的旧记录外，有 106 个文件提到这些路径（`git grep -l`）。
- `package.json` 的 `files` 里写的是 `docs/v2/`；`bin/buildbeat.js` 引入 `../src/v2/cli/run.js`。
- 用路径片段拼出来的引用，改名时搜 `v2/` 搜不到：`tests/check_docs.py:844`、`tests/v2-templates-firstrun.test.js:19`、`tests/v2-closeout.test.js:228`、`tests/v2-commit-trailers.test.js:19`、`tests/v2-release-envs.test.js:219`、`tests/v2-run-config-check.test.js:155-156`、`tests/v2-screenshot-release.test.js:337`。
- 说到 `v2` 分支的地方：`.github/workflows/ci.yml:8`、`.github/workflows/codeql.yml:12`（推送到 `v2` 时跑检查），`CONTRIBUTING.md:18`、`docs/RELEASING.md:12-14`（日常开发在 `v2` 上）。
- 已接入的项目里，照旧模板抄下来的文件（AGENTS.md 等）可能写着 `templates/v2/…` 或 GitHub 上 `docs/v2/guide/…` 的地址。这些文件在别人的仓库里，这里改不到。
- `docs/v2/guide/12-without-runtime.md` 里给没装运行时的团队的提示词，写了 GitHub 上 `docs/v2/guide/` 的完整地址。

## 范围

做：

- `src/v2/` 整个上移到 `src/`；`docs/v2/guide/` 移到 `docs/guide/`，`docs/v2/SPEC-0001-events-v1.md` 移到 `docs/`；`templates/v2/` 下的内容上移到 `templates/`；`tests/v2-*.test.js` 去掉前缀。都用 `git mv`，保留历史。
- 所有引用跟着改：代码里的引入、测试、文档检查、打包清单、README、Skill、指南、模板、示例、插件说明、CONTRIBUTING、RELEASING、CHANGELOG 的未发布条目、CI 里的路径。
- 文档里"日常开发在 `v2` 分支"改成"从 `main` 开分支、提 PR 回 `main`"；CI 不再对推送到 `v2` 触发。
- CHANGELOG 未发布条目里写明路径变了，以及已接入项目要改哪两类引用。

不做：

- 不改任何行为、命令、配置键、记录格式。
- 不删远端的 `v2` 分支，不改 GitHub 上的分支保护：那是所有者在 GitHub 上的操作。
- `delivery/work/` 里的旧记录不回头改，里面的旧路径保持原样。
- `docs/SPEC-0001-events-v1.md` 文件名里的 `v1` 是台账格式的版本号，不动。
- 不在旧路径留跳转文件。

## 开工前待拍板

所有者已选这次一起改，下面按推荐做；要改哪项直接说。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 新路径 | `src/<原来 src/v2 下的内容>`、`docs/guide/`、`docs/SPEC-0001-events-v1.md`、`templates/<原来 templates/v2 下的内容>`、`tests/<原名去掉 v2->` | 只改对外看得到的 docs 和 templates，src 和 tests 不动：仓库里仍然到处是 v2 |
| 2 | 旧路径留不留跳转 | 不留。CHANGELOG 写明：项目里引用 `templates/v2/…` 的改成 `templates/…`，引用 `docs/v2/guide/…` 的改成 `docs/guide/…` | 留一层只含指路文字的旧文件：又是一层要以后再删的兼容 |
| 3 | 测试文件重名 | 去掉前缀后与现有文件重名的，保留现有文件名不动、带前缀的那个改叫别的名字并在结果页写明。当前核对无重名 | — |
| 4 | 止损线 | 这项工作的审查上限 4 轮 | — |

## 验收

机器检查，过全套门禁：`npm test`、`npm run check:docs`、`npm run test:envelope`、`npm run test:plugin`、`npm run test:pack-firstrun`、`npm run pack:check`。另外：

- `git ls-files | grep -E '(^|/)v2(/|-)'` 除 `delivery/work/` 外没有结果。
- `git grep -nE 'src/v2|docs/v2|templates/v2|tests/v2-' -- . ':!delivery/work' ':!CHANGELOG.md'` 没有结果；CHANGELOG 里只在说明"从哪改到哪"的那一条出现。
- 测试数量和改名前一样（346 项），全部通过。
- `buildbeat history --repo . --path src/runtime/reader.js` 仍能追到 WORK-READER-TEST（改名不丢追溯）。
- 打包清单里的路径都是新路径，文件个数不变。

由人确认：批准决定；远端 `v2` 分支和分支保护怎么处理。

## 实施计划

1. `git mv` 四组路径。
2. 按清单改引用：先改代码和测试到全绿，再改文档、模板、示例、检查脚本、打包清单、CI。
3. 改说到 `v2` 分支的文字；CHANGELOG。
4. 跑全套门禁和上面的检查，送审。

## 停止条件

- 改名后有行为变化，或有测试要改断言才过（改路径字符串不算）。
- `history --path` 在改名后追不到原来的工作。
- 要动 `delivery/work/` 里的旧记录才能过检查。
