# 写成目录的引用不再被当成同名文件

## 目标

"已核实的现状"里写一个目录（比如 `docs/`），运行时本该不理它：目录不是指针，WORK-FACT-POINTERS 的 CHANGELOG 条目也是这么写的。实际上运行时先把末尾的斜杠去掉，再按后半段去找文件，于是对上了别处一个同名文件。本仓 `plugins/buildbeat/docs` 是 Git 里记作文件的符号链接，现状里写 `docs/` 就被当成了指向它的指针：计进 "N pointers"，那个链接一改就报 "changed"，让人去重查一处根本没引用的代码；真写了 `plugins/buildbeat/docs` 的那一条反而被它顶掉。

修好后，末尾带斜杠的写法一律当目录、不当指针；从仓根写全的目录名（`docs`、`templates`）也不再被后半段的同名文件抢走。WORK-FACT-POINTERS 还没发版，现在修，用户就不会碰到这个错。

## 起因

2026-10-25，WORK-FACT-POINTERS 合进 main（`61a7f3b`）以后，驱动会话发现并交来起草：现状一节里写 `docs/`，解析成了 `plugins/buildbeat/docs` 这个文件，被当成了指针。

- follows: WORK-FACT-POINTERS

WORK-FACT-POINTERS 的 result.md 没提目录怎么处理；它定下的规矩是"整条路径对上文件就用它，否则后半段唯一对上一个文件才算"。

## 已核实的现状（2026-10-25，main `61a7f3b`）

**代码已确认**

- `src/v2/runtime/facts.js:105-114`（`locate`）：第一步去掉路径末尾的斜杠（106 行），然后先找整条路径、再按后半段在核实提交的文件里找（107-111 行），文件都对不上才看是不是目录（112 行）。所以写成目录的 docs/ 先变成 docs，再按后半段对上 plugins/buildbeat/docs。
- `src/v2/runtime/facts.js:181-185`：文件清单来自 `git ls-tree -r --name-only`，符号链接和普通文件一样列为文件；目录清单是从文件路径推出来的。
- `plugins/buildbeat/docs` 在 Git 里是符号链接（`git ls-files -s` 显示模式 120000）。插件目录下共 7 个这样的链接，其中 docs、templates、example 三个与仓根的目录同名。
- `src/v2/runtime/facts.js:25-27`（`NOT_A_PATH`）和 `src/v2/runtime/facts.js:48-55`：解析时只排除 URL、占位符、通配符、选项和绝对路径，末尾带斜杠的照样成为指针，交给 `locate`。
- `src/v2/runtime/facts.js:187-196`：同一位置只留第一次的写法，所以假指针还会顶掉后面真写的 plugins/buildbeat/docs，列出来的原文成了 docs/。
- 现有测试只覆盖了"目录没有同名文件"：夹具（`tests/v2-fact-pointers.test.js:50-93`）的现状里写了 src/lib/（`tests/v2-fact-pointers.test.js:72`），夹具里只有 src/lib 这个目录、没有叫 lib 的文件，所以一直被忽略。
- 文字上的承诺：`CHANGELOG.md:20` 的未发布条目写 "directories … are not pointers"；`templates/v2/work.example.md:18` 和 `SKILL.md:68` 只说后半段要唯一，没提目录。

**复现（2026-10-25，Git 2.54；临时工作目录和临时仓用完已删）**

- 在本仓 61a7f3b 上建一项临时工作，现状写 docs/、docs、docs/:3、src/v2/、src/lib/、missing-dir/，直接调 `checkFacts`：docs/ 和 docs/:3 都解析成 plugins/buildbeat/docs（same）；单写 docs 也解析成它（与 docs/ 同一位置，被去重吞掉）；另试单写 templates，解析成 plugins/buildbeat/templates；src/v2/ 被忽略；本仓没有的 src/lib/ 和 missing-dir/ 列为 "not found (no file at 61a7f3b)"。`status --work` 打印 "5 pointers, 0 changed, 2 not found"。
- 临时仓里 docs/guide.md 在 docs 目录下，plugin/docs 是同名的普通文件（不是符号链接），现状写 docs/、./docs/、docs/:3、docs、nowhere/、plugin/docs、guide.md：docs/ 和 docs/:3 解析成 plugin/docs；真写的 plugin/docs 被去重吞掉；nowhere/ 列为 not found；guide.md 正常对上 docs/guide.md。和符号链接无关，只看名字。

**待核**

- 修完后在本仓重跑上面那份临时现状，确认目录写法都不再出现：驱动会话在交 Run 之前做。

## 范围

包含：

- 末尾带斜杠的写法（`docs/`、`./docs/`、`docs/:3`）一律当目录，不是指针，不管核实时的提交里有没有这个目录（第 1 项）。
- 从仓根写全、不带斜杠的路径正好是一个目录时（`docs`、`templates`），也当目录，不再按后半段去对同名文件（第 2 项）。
- `facts.js` 里说明指针规则的两处注释跟着改；CHANGELOG 未发布条目补一句（第 3 项）。
- 回归测试。

不包含：

- 只写后半段、既能对上某个目录又能对上某个文件的写法（比如单写 `lib`，而 `src/lib/` 是目录、`vendor/lib` 是文件）：照旧按文件算。
- 符号链接本身怎么比对：指向目录的链接仍当一个文件，链接本身变了才算变。
- 模板、Skill 和中英文档：它们没写目录怎么处理；CHANGELOG 已经写了"目录不是指针"，修好后两边一致。
- 发布、推送、版本号。

## 开工前待拍板

接受本说明即按"推荐"执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 末尾带斜杠、但核实时的提交里没有这个目录（`missing-dir/`） | 也忽略，不列出：斜杠已经说明写的是目录，目录本来就不比对 | 列为 `not found  missing-dir/  (no directory at <commit>)`：能抓到目录名写错，但要多一种原因文案，而目录本来就不在比对范围里；现在报的 "no file" 本身也说错了 |
| 2 | 从仓根写全、不带斜杠的目录名（`docs`），后半段又能对上一个同名文件 | 一并修：整条路径是目录就当目录，不再去对后半段。这和"整条路径对上文件就用它、不看后半段"是同一条规矩；本仓插件目录里 docs、templates、example 三个链接都会撞上 | 只修带斜杠的：改动更小，但单写 `docs` 仍会冒出指向插件链接的假指针 |
| 3 | CHANGELOG 怎么写 | 在未发布的 WORK-FACT-POINTERS 条目里补一句并标本工作编号：那条还没发版，读者看到的是一份准确的说明 | 单独新增一条"修复"：更醒目，但修的是一个从没发布过的错 |

**对外名字（接受即确认）**

- 没有新的命令、选项、输出文案或 JSON 字段。看得见的变化只有：末尾带斜杠的写法和从仓根写全的目录名不再出现在 `status --work` 的 facts 块和 `--json` 的 `facts.pointers` 里，也不再计入 `<n> pointers`；带斜杠却对不上的不再列为 `not found  <text>  (no file at <commit>)`。
- CHANGELOG 未发布的 WORK-FACT-POINTERS 条目里，在 "and fenced or indented code and HTML comments do not count." 之后补一句（原文）：

  > A path ending in `/` is a directory and never a pointer, whether or not that directory exists at the commit, and a whole path that names a directory is not matched to a file by its tail (WORK-FACT-DIR-POINTERS).

## 验收

机器检查：

- `verify.sh` 全过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑、本工作范围内的 `git diff --check`（照 WORK-FACT-POINTERS 那份写，起点改成 `61a7f3b`）。
- `tests/v2-fact-pointers.test.js` 新增一条回归测试，夹具自己建：`docs/guide.md`（docs 是目录）和 `plugin/docs`（同名普通文件）。现状写 `docs/`、`./docs/`、`docs/:3`、`docs`、`nowhere/`、`plugin/docs`、`guide.md`：
  - `status --work --json` 的 `facts.pointers` 只有两条：原文 `plugin/docs` 对上 `plugin/docs`，原文 `guide.md` 对上 `docs/guide.md`，都是 `same`。
  - 文本块只有一行：`  facts: checked on <commit>, compared with HEAD: 2 pointers, 0 changed`，没有 `not found` 行。
  - 这条测试在现在的代码上失败（驱动会话交 Run 前确认并写进 notes.md）。
- 解析测试（`parseFacts` 那条）加上 `docs/`，断言它不在指针里。
- 已有测试的断言一条不改照样通过（夹具里的 `src/lib/` 仍被忽略）。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 无。改动只在解析，机器检查已覆盖；"待核"那一条由驱动会话做。

## 实施计划

1. `src/v2/runtime/facts.js`：解析时把末尾是 `/` 的写法和 URL、选项一样跳过（`NOT_A_PATH` 加一条），`locate` 去掉去斜杠那一步；`locate` 在按后半段找文件之前先看整条路径是不是目录（第 2 项）。两处注释跟着改。
2. 测试：新增上面那条，用自己的小夹具和普通文件（`git ls-tree` 里符号链接和普通文件一样是文件，匹配只看名字，用普通文件不依赖文件系统对符号链接的支持）；`parseFacts` 那条加 `docs/`。
3. CHANGELOG 补一句（第 3 项）。

驾驶会话亲自写代码，提交带 `Work: WORK-FACT-DIR-POINTERS`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。

## 停止条件

- 修完后已有测试的断言要改（说明行为改到了范围以外），先停下来问。
- 发现后半段匹配还有目录以外的错配，范围要扩，先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
