# 工作文件夹只放记录，过程材料不放进去，太多时提醒

## 目标

BuildBeat 规定了一项工作要留哪几份记录，却没说工作文件夹里不能放别的。会话于是把命令输出、回读结果、一次性脚本一份份存进去，只增不减。以后翻记录的人和会话，要在一堆材料里找结论。

做完后：

1. Skill、README 的文件说明、指南 12 写明：工作文件夹只放这项工作的记录，外加这项工作确实要用的少量文件，比如它的验证脚本。过程材料不放进去：
   - 命令输出、回读结果：运行时会自己记下验证、审查、上线回读的摘要和指纹，原文只留本机。
   - 结论：写进 `result.md`。
   - 以后还要用的脚本：放进项目自己的脚本目录。
2. `accept` 和 `check` 发现工作文件夹里记录以外的文件超过 10 个，打印一行提醒，列出前 5 个和总数；只提醒，不拦。

## 起因

2026-11-01 所有者问：「我们现在的 work 都有明确的规范吗，不会出现填充大量垃圾信息和日志的情况存在吧」。会话盘点后，所有者说「做进 BuildBeat」。

盘点结果（只数已提交的；记录以外的文件按下面第 1 项的定义算）：

- BuildBeat 本仓 30 项工作：多数只有 1～2 个记录以外的文件（验证脚本、驾驶记录），6～10 个的 4 项，超过 10 个的 1 项（13 个）。
- 试点工作区四个代码仓 46 项工作：只有 3 项有记录以外的文件，最多 3 个。
- 试点工作区主仓 93 项工作：55 项超过 10 个，40 项超过 20 个，最多一项 699 个。除了截图和压缩包，还有约 3000 个文本文件：json、md、py、sh、txt，放在 `release/`、`evidence/`、`run-envelope/` 这类子目录里。9 月新增约 2200 个，10 月约 1000 个，11-01 一次提交又加了 23 个，都是发布清单、回读 JSON、一次性脚本和存提交号的 txt。
- 这些都是文本，单个都小。11-01 的大文件提醒（WORK-DELIVERY-BINARIES）管的是二进制和 256 KB 以上的文件，挡不住这些。

- follows: WORK-DELIVERY-BINARIES

## 已核实的现状（2026-11-01，main `895653e`）

**代码已确认**

- 运行时自己往工作文件夹里写的只有四种：
  - `decisions.jsonl`：`src/v2/runtime/decisions.js:102`
  - `review-findings.jsonl`：`src/v2/runtime/findings.js:137`
  - `releases.jsonl`：`src/v2/runtime/release.js:182-186`
  - `runs/<RUN>/run-record.json`：`src/v2/runtime/run-record.js`
- 运行时读的有 `work.md`、`intent.md` / `plan.md`（旧写法）、`result.md`、`run-config*.yaml`，以及可选的 `env-facts.md`（`src/v2/runtime/overview.js:237`）。
- 上线回读的完整输出写在本机 `.buildbeat/runtime/releases/<ID>/`（`src/v2/runtime/release.js:155-162`），`releases.jsonl` 里只留最后 20 行（`src/v2/runtime/release.js:27`）。
- `src/v2/runtime/overview-repos.js:111-157`（`heavyRecordsWarning`）：用 `git ls-files --others --exclude-standard` 列出工作文件夹里将进 Git 的文件，挑出二进制和 256 KB 以上的提醒；最多列 5 个，多的写 `and <k> more`。
- `src/v2/cli/run.js:1119-1124` 是 `accept` 依次打印「被忽略」「大文件」「现状变了」三条提醒的地方，`src/v2/cli/run.js:1245-1250` 是 `check` 打印同样三条的地方。
- `tests/v2-code-trace.test.js` 里有大文件提醒的三条测试，新测试照它们的写法。

**文档里的说法**

- `README.md:216-236` 和 `README.en.md` 对应几行：文件树列了一项工作的几份记录，下面一条写着「`delivery/` 进 Git…里面的截图、压缩包和日志只留本机」。没说别的东西能不能放。
- `SKILL.md:60`：`delivery/` 进 Git、截图压缩包日志不进、大文件会提醒。同样没说别的东西能不能放。
- `docs/v2/guide/12-without-runtime.md:88` 和英文版同一行：同上。

## 范围

包含：

- `src/v2/runtime/overview-repos.js` 新增提醒，`src/v2/cli/run.js` 的 `accept`、`check` 各调用一次。
- `SKILL.md:60`、README（中英）文件说明那一条、指南 12 第 88 行（中英）各补一句。
- CHANGELOG `## Unreleased`。
- 回归测试。

不包含：

- 清理已经提交的过程材料：已经在历史里，删了不会让仓库变小；要不要从当前目录里删，由各仓所有者自己定。
- `status` 的输出：提醒只出现在开工前的两个口子，和另外两条提醒一样。
- 拦住 `accept` / `check`：只提醒。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 哪些算「记录」 | 运行时写的和读的：`work.md`、`intent.md`、`plan.md`、`result.md`、`run-config*.yaml`、`decisions.jsonl`、`review-findings.jsonl`、`releases.jsonl`、`env-facts.md`、`runs/<RUN>/run-record.json`；其余都算记录以外的文件 | 把验证脚本、驾驶记录也算记录：少几条提醒，但它们没有固定名字，只能按扩展名猜 |
| 2 | 门槛 | 记录以外的文件超过 10 个才提醒：本仓 30 项里只有 1 项超过，四个代码仓一项也没有，试点主仓 93 项里有 55 项 | 超过 5 个：本仓还会多 4 项（多是 3.x 时代的工作，带 workflow.yaml 和审查脚本），提醒到正常的工作 |
| 3 | 数哪些文件 | 已经进了 Git 的和下一次提交会带进去的都数，被忽略的不数：读者看到的是整个文件夹，不只是这一次提交 | 只数下一次提交会带进去的（像大文件提醒那样）：会话每次只加几个，就永远不会提醒 |
| 4 | 在哪提醒 | `accept` 和 `check`，放在大文件提醒之后，只提醒不拦 | 拦住：一项确实需要很多附件的工作就开不了工 |

**对外名字（接受即确认）**

- 提醒原文（一行，最多列 5 个文件，多的写 `and <k> more`；路径相对这项工作的文件夹，按路径排序）：
  `warning: delivery/work/<ID>/ holds <n> files besides its records: <path>, …, and <k> more; keep command output, readback results and one-off scripts out of it (the runtime keeps verify, review and readback output on this machine) and write the conclusions into result.md`
- 文档补的说法：「工作文件夹只放这项工作的记录，外加它确实要用的少量文件（比如验证脚本）；命令输出、回读结果、一次性脚本不放进去，结论写进 `result.md`，以后还要用的脚本放进项目自己的目录。记录以外的文件超过 10 个时，`accept` 和 `check` 会提醒。」英文版：「A work's folder holds its records and the few files the work itself needs, such as its verify script. Command output, readback results and one-off scripts stay out: write the conclusions into `result.md` and keep scripts you will run again in the project's own directories. `accept` and `check` warn when more than 10 files besides the records are there.」

## 验收

机器检查：

- `verify.sh` 全部通过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑，以及本工作范围内的 `git diff --check`（起点 `895653e`）。
- `tests/v2-code-trace.test.js` 新增测试：
  - 工作文件夹里放全套记录（work.md、run-config.yaml、decisions.jsonl、review-findings.jsonl、releases.jsonl、env-facts.md、result.md、runs/R/run-record.json），再放 10 个别的文件：`check` 和 `accept` 都不提醒。
  - 再加 1 个（共 11 个）：两处都提醒，开头是 `holds 11 files besides its records`，列出按路径排序的前 5 个和 `and 6 more`，不列任何一份记录。
  - 把其中几个提交进 Git 后照样计数；按模板忽略的截图不计数。
  - 新测试在现在的代码上失败（驾驶会话交 Run 前确认，写进 notes.md）。
- 已有测试的断言一条不改照样通过。
- 在本仓和试点工作区所有工作上只读试跑：本仓 1 项，四个代码仓 0 项；主仓提醒的项数要和已提交文件的盘点（55 项）对得上，有出入就写明是哪些还没提交的文件造成的。结果写进 notes.md。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 无。

## 实施计划

1. `src/v2/runtime/overview-repos.js`：在 `heavyRecordsWarning` 旁加 `extraFilesWarning(repoRoot, workId)`，用 `git ls-files --cached --others --exclude-standard -z` 列出工作文件夹里的文件（只数还在磁盘上的），去掉记录，超过 10 个就生成上面的提醒；Git 出错时不提醒。
2. `src/v2/cli/run.js`：`accept` 和 `check` 在大文件提醒之后打印它。
3. 文档各补一句；CHANGELOG。
4. 测试。

驾驶会话亲自写代码，提交带 `Work: WORK-FOLDER-EXTRAS`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。WORK-LIVE-FACTS 也在改 CHANGELOG 的 `## Unreleased`，所以等它合入会话分支以后，这项工作才开 Run。

## 停止条件

- 已有测试的断言要改：先停下来问。
- 只读试跑时，提醒落在明显正常的工作上（比如只有验证脚本和几个测试样例）：先停下来问门槛。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
