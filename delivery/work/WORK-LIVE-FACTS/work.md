# 项目文件只写规矩和去哪查，不抄会变的事实

## 目标

BuildBeat 的模板在教人把会变的事实抄进项目文件：`templates/v2/BUILDBEAT.md` 第一句就是「记下装的运行时版本」。一个错的上下文比没有更糟，AI 会照着它干活。

做完后：

1. 删掉 `templates/v2/BUILDBEAT.md` 和示例项目的 `example/BUILDBEAT.md`。项目这一级只留 `AGENTS.md`（`CLAUDE.md` 只是指向它的一行）。
2. `AGENTS.md` 模板、Skill 的收口规则、指南 12 的收口那一步写明：项目文件只写规矩和去哪查；运行时版本、进度、谁在做、上没上线这类会变的事实不抄进去，用 `buildbeat --version`、`buildbeat status` 和 Git 现查。
3. 文档检查挡住两件事：这两个文件回来，以及模板或示例里写死运行时版本号。

## 起因

2026-11-01 所有者在对话里问：要不要给项目建一个项目上下文文件，会不会和 AGENTS.md 冲突；还说「一个错误的上下文的危害大于没有上下文」。会话的看法是不建新文件，项目级只留 AGENTS.md，只写规矩和去哪查。所有者接着说「先改模板」。

试点工作区里的同类文件就是现成的例子：

- 它一层层叠了五条「某日起运行时 = 某版本」（2.0.0-beta.4、3.0.1、3.3.0、4.0.0、5.1.0）。
- 10-24 发现它写着 4.0.0，实际装的是 4.2.3。
- 11-01 上午写进去「运行时 = 5.1.0」，当天下午发了 5.2.0，这句话不到一天就错了。

- related: WORK-CONTEXT-CLOSEOUT

## 已核实的现状（2026-11-01，main `895653e`）

**代码已确认**

- `templates/v2/BUILDBEAT.md:3`：「Record the installed runtime version and project-owned constraints when adopting it.」
- `example/BUILDBEAT.md:3` 写着运行时 3.0.0。`example/BUILDBEAT.md:9` 说「升级后更新上面的版本行」。这一页还写着 intent / plan 和 `SKILL.md §0.5`，现在都不对了。
- 运行时不读 `BUILDBEAT.md`：在 `src`、`bin`、`plugins`、`.claude-plugin` 里用 `git grep` 搜不到。
- 没有现行指南让人复制 `BUILDBEAT.md`：`docs/v2/guide/01-quickstart.md:6` 只让人复制 `v2/AGENTS.md` 和 `v2/CLAUDE.md`，`docs/v2/guide/12-without-runtime.md:20-32` 只让人复制 work 和 result 两个样板。提到它的只剩 `docs/history/` 下的历史文档。
- 其中 `docs/history/retired-skill/07-templates-and-lessons.md:10` 用相对链接指向模板那份。文件删掉后链接检查会失败。这页开头写明「原文与原节号不变，只调整了相对链接」。（RUN-LIVE-FACTS-01 开工后发现，补记）
- `tests/check_docs.py:57` 和 `tests/check_docs.py:64` 把这两个文件列为现行文档，`tests/check_docs.py:93` 把模板那份列为必须存在的模板。`tests/check_docs.py:145-170` 是「删掉后不能回来」的清单。
- `tests/support/package-files.txt:43` 和 `tests/support/package-files.txt:105` 是 npm 包文件清单里的这两行，现在包里一共 114 个文件。
- `templates/v2/AGENTS.md:1-20` 和 `example/AGENTS.md` 里都没有「不抄会变的事实」这一条。
- `SKILL.md:71` 收口规则写的是「写进项目已有的文档（没有合适的就写进 AGENTS.md，保持短，过时的当场删）」，没说会变的事实不要写。
- `docs/v2/guide/12-without-runtime.md:43` 和英文版同一行是收口那一步：结论先写进项目文档，再记成 `路径 @ 提交`。

## 范围

包含：

- 删除 `templates/v2/BUILDBEAT.md`、`example/BUILDBEAT.md`。
- `templates/v2/AGENTS.md`、`example/AGENTS.md` 各加一段。
- `SKILL.md:71`、指南 12 第 4 步（中英）各补一句。
- `tests/check_docs.py`：从现行文档和必需模板里去掉这两个文件，加进删除清单；新增「模板和示例不写死运行时版本」检查。
- `tests/support/package-files.txt` 去掉两行。
- CHANGELOG `## Unreleased`。
- `docs/history/retired-skill/07-templates-and-lessons.md:10` 指向 `templates/v2/BUILDBEAT.md` 的链接改指 v5.2.0 版本的 GitHub 地址（`https://github.com/HaiYangBG1/BuildBeat/blob/v5.2.0/templates/v2/BUILDBEAT.md`），文字不改。

不包含：

- 试点工作区自己的那份文件：它在另一个仓，要所有者另行授权。
- `templates/v2/指挥台.md`：它写的是做事的步骤，不含会变的事实。
- `docs/history/` 下的历史文档：除上面那一个链接外保持原样。
- 给 AGENTS.md 加指针比对：等真踩到坑再说。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | `BUILDBEAT.md` 怎么处理 | 两份都删，加进删除清单：运行时不读它，也没有指南让人复制它，它唯一的内容就是一个会过时的版本号 | 留着，改成「运行 `buildbeat --version` 查看」：不再教人抄版本号，但项目里还是多一个和 AGENTS.md 并列的入口文件 |
| 2 | 规则写在哪 | `AGENTS.md` 模板（和示例那份）、Skill 收口规则、指南 12 收口那一步：分别对应项目文件、用 Skill 的会话、不装运行时的人 | 只写 `AGENTS.md`：最少，但用 Skill 收口时没人提醒 |
| 3 | 要不要机器挡 | 要：文档检查发现 `templates/` 或 `example/` 下的文件写了 `@haiyangbg/buildbeat@<数字>` 就失败（`@latest` 不算） | 不挡：省一个检查，但示例那份就是这样悄悄过时到 3.0.0 的 |
| 4 | 已经复制了这个文件的项目 | CHANGELOG 写明：运行时从来不读它，可以删；要留就删掉里面的版本行。发版不会动项目文件 | 运行时检测到它就提醒：要新代码，而且提醒的是一个无害的文件 |

**对外名字（接受即确认）**

- `AGENTS.md` 模板新增的一段（原文）：

  ```
  Keep this file to rules and where to look. Do not copy facts that change,
  such as the runtime version, what is in progress, who is doing what or what
  is deployed: check them with `buildbeat --version`, `buildbeat status` and
  Git. A wrong line here misleads every session that reads it; delete it when
  you find it.
  ```

- `SKILL.md:71` 在「过时的当场删」之后补：「会变的事实（运行时版本、进度、谁在做、上没上线）不写进项目文档，只写去哪查（`buildbeat --version`、`status`、Git）。」
- 指南 12 第 4 步补：「会变的事实（版本、进度、谁在做）不写进去，只写去哪查。」英文版：「Facts that change (versions, progress, who is doing what) stay out; write where to look them up instead.」
- 文档检查的报错：`<path>: pins a runtime version (<match>); templates and the example say where to look (buildbeat --version), not which version`

## 验收

机器检查：

- `verify.sh` 全部通过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑，以及本工作范围内的 `git diff --check`（起点 `895653e`）。
- 两个 `BUILDBEAT.md` 已不在仓里；把任何一个放回来，文档检查报「removed scope must not return」。
- 在 `templates/` 或 `example/` 下任意文件写进 `@haiyangbg/buildbeat@5.2.0`，文档检查报上面那句错；改回 `@latest` 就通过。由驾驶会话临时改一次确认，结果写进 notes.md。
- `npm publish --dry-run` 显示 112 个文件。
- 已有测试的断言只改两处：`tests/check_docs.py` 的文件清单和 `tests/support/package-files.txt`，其余一条不改照样通过。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 无。

## 实施计划

1. 删两个文件；改 `tests/check_docs.py` 的三处清单和 `tests/support/package-files.txt`。
2. `tests/check_docs.py` 加 `check_no_pinned_runtime()`：遍历 `templates/` 和 `example/` 下 Git 跟踪的文本文件，匹配 `@haiyangbg/buildbeat@\d`，在 `main()` 里调用。
3. 两份 `AGENTS.md`、`SKILL.md`、指南 12（中英）、CHANGELOG。

驾驶会话亲自写代码，提交带 `Work: WORK-LIVE-FACTS`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。

## 停止条件

- 发现运行时、测试或插件读 `BUILDBEAT.md`，或者现行文档让人复制它：先停下来问。
- 新检查在现有模板或示例里命中 `example/BUILDBEAT.md` 以外的文件：先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
