# delivery/ 里的截图、压缩包和日志不进 Git，要进时提醒

## 目标

BuildBeat 一直说「`delivery/` 跟代码一起进 Git」，但没说里面的截图、压缩包和日志怎么办。文字记录在 Git 里存得很省，二进制文件却是每改一版都整份留在历史里，仓库只增不减。

做完后：

1. 项目模板 `gitignore.template` 默认忽略 `delivery/` 下的截图、压缩包和日志，它们只留在本机；`delivery/` 本身照旧进 Git。
2. `accept` 和 `check` 发现某项工作的文件夹里有**还没进 Git、也没被忽略**的这类文件，或者超过 256 KB 的文件，打印一行提醒，列出文件和大小；只提醒，不拦。
3. 快速开始、只用 Skill 和项目文件的指南、Skill、README 都写明这一条。

## 起因

2026-11-01 把试点工作区五个代码仓的 `delivery/` 迁进 Git 时实测（所有者「做进 BuildBeat」）：

- 五个代码仓两个月的文字记录 664 个文件，原始 2.8 MB、压缩后 0.85 MB，一年约 5 MB。
- 试点主仓两个月 Git 历史涨到 36 MB，几乎都是证据截图（约 450 KB 一张）和一个 845 KB 的压缩包；它的 `delivery/work` 在磁盘上 84 MB，另有约 42 MB 没提交的同类文件。
- 所有者定：截图只留本机；主仓以后不再收二进制，已提交的历史不动。

- related: WORK-CODE-TRACE

## 已核实的现状（2026-11-01，main `a8f24c5`）

**代码已确认**

- `src/v2/runtime/overview-repos.js:96-109`（`ignoredRecordsWarning`）：用 `git check-ignore --no-index` 看工作的 work.md 是否被忽略，被忽略就返回一行提醒。
- `src/v2/cli/run.js:1119-1120`：`accept` 打印接受结果后调用它；`src/v2/cli/run.js:1243-1244`：`check` 在列出工作说明状态后调用它。
- `src/v2/runtime/orchestrator.js:882-893`：`requireScreenshot` 的截图写在运行时目录下，交给 verify 的 `BUILDBEAT_SCREENSHOT_DIR`，不经过 `delivery/`；忽略 `delivery/` 下的图片不影响截图证据。
- `templates/gitignore.template:19-20`：只写了「`delivery/` 要进 Git」，没提二进制文件；`example/gitignore.template` 同一段之后是单仓项目的 `node_modules/`。
- `tests/v2-code-trace.test.js:302-323`：「delivery/ 被忽略」提醒的测试，用本地排除文件和 .gitignore 两种写法各验一次。

**文档里的说法**

- `docs/v2/guide/01-quickstart.md:6` 和英文版同一行：`delivery/` 要跟代码一起进 Git，不要排除它。
- `docs/v2/guide/12-without-runtime.md:88` 和英文版同一行：同上。
- `SKILL.md:60`：同上，并说 `accept` 和 `check` 发现被忽略会提醒。
- `README.md:236` 和 `README.en.md` 对应一行：文件说明里的 `delivery/` 进 Git。

## 范围

包含：

- `templates/gitignore.template`、`example/gitignore.template` 加一段忽略规则（第 1 项）。
- `accept`、`check` 的新提醒（第 2、3、4 项）。
- 快速开始（中英）、指南 12（中英）、`SKILL.md`、README（中英）各补一句；CHANGELOG 新开 `## Unreleased`。
- 回归测试。

不包含：

- 拦住提交的 Git 钩子：BuildBeat 不往项目里装钩子。
- 清理已经提交进历史的二进制文件：改写历史的风险比收益大。
- `status` 的输出：提醒只在开工前的两个口子出现。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 模板默认忽略哪些类型 | `png`、`jpg`、`jpeg`、`gif`、`webp`、`zip`、`tgz`、`gz`、`log`，和试点迁移实际用的一致 | 再加 `pdf`、`mp4` 等：覆盖更全，但有的项目把 pdf 当正式交付文档放进记录，默认忽略会让它悄悄不进 Git |
| 2 | 大小提醒的门槛 | 256 KB：试点五个代码仓里最大的文字记录 73 KB，主仓证据截图约 450 KB，256 KB 正好分开 | 1 MB：提醒更少，但 450 KB 的截图一张张进 Git 也不会提醒 |
| 3 | 在哪提醒 | `accept` 和 `check`，和「delivery/ 被忽略」放在一起，只提醒不拦 | 拦住 `accept` / `check`：能挡住，但一张不小心的截图就卡住开工，和「被忽略」只提醒的做法不一致 |
| 4 | 看哪些文件 | 只看这项工作文件夹里还没进 Git、也没被忽略的文件（`git ls-files --others --exclude-standard`）：正是下一次提交会带进去的 | 连已提交的一起看：老工作每次 `check` 都会提醒那些早已进了历史、删了也不会变小的文件 |

**对外名字（接受即确认）**

- 提醒原文（一行，最多列 5 个文件，多的写 `and <k> more`；路径相对这项工作的文件夹，大小写成 `<n> KB`，满 1024 KB 写成保留一位小数的 `<n> MB`）：
  `warning: delivery/work/<ID>/ has <n> file(s) that would go into Git and stay in its history for good: <path> (<size>), …; keep screenshots, archives and logs on this machine (see templates/gitignore.template)`
- 两份 `gitignore.template` 新增的一段（原文）：

  ```
  # delivery/ 里的截图、压缩包和日志只留本机，不进 Git：二进制文件每改一版都整份留在 Git 历史里，仓库只增不减
  # (buildbeat accept / check 发现工作文件夹里有会进 Git 的这类文件或超过 256 KB 的文件会提醒)
  delivery/**/*.png
  delivery/**/*.jpg
  delivery/**/*.jpeg
  delivery/**/*.gif
  delivery/**/*.webp
  delivery/**/*.zip
  delivery/**/*.tgz
  delivery/**/*.gz
  delivery/**/*.log
  ```

- 文档补的说法：「截图、压缩包和日志不进 Git，模板里已写好忽略规则」，各处按原句式接上。

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`（起点 `a8f24c5`）。
- `tests/v2-code-trace.test.js` 新增测试：
  - 工作文件夹里放一张小截图 `evidence/shot.png`、一个 300 KB 的 `evidence/big.json`、一个小的 `notes.md`：`check` 和 `accept` 都打印提醒，列出 `evidence/big.json (300 KB)` 和 `evidence/shot.png (…)`，不列 `notes.md`，开头是 `has 2 file(s)`。
  - 照模板写好忽略规则后：截图不再列出，`big.json` 仍在。
  - 把 `big.json` 提交以后：不再提醒。
  - 文件夹里只有小文字文件时不提醒；多于 5 个时只列 5 个并写 `and <k> more`。
  - 新测试在现在的代码上失败（驱动会话交 Run 前确认并写进 notes.md）。
- 模板测试：在临时仓里放进两份 `gitignore.template`，`delivery/work/W/a.png` 被忽略，`delivery/work/W/work.md` 不被忽略。
- 已有测试的断言一条不改照样通过。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 无。

## 实施计划

1. `src/v2/runtime/overview-repos.js`：在 `ignoredRecordsWarning` 旁加 `heavyRecordsWarning(repoRoot, workId)`：`git ls-files --others --exclude-standard -z` 列出工作文件夹里将进 Git 的文件，按扩展名或大小（≥ 256 KB）挑出来，生成上面的提醒；Git 出错时不提醒。
2. `src/v2/cli/run.js`：`accept` 和 `check` 在「被忽略」提醒后打印它。
3. 两份模板加规则；文档各补一句；CHANGELOG。
4. 测试。

驾驶会话亲自写代码，提交带 `Work: WORK-DELIVERY-BINARIES`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。

## 停止条件

- 已有测试的断言要改，先停下来问。
- 发现运行时自己往 `delivery/` 里写二进制文件（新规则会让它们不进 Git），先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
