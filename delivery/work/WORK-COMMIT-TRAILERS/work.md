# 提交自动带上 Work: 标记；老提交按标题里的编号找回

## 目标

`Work: <ID>` 标记现在全靠人和会话自觉。随包信封的自动提交会带上，可会话自己写的提交几乎都不带：一个业务试点项目从 10 月 14 日起一个都没有，尽管绝大多数提交的标题里都写了工作编号。`history --path` 和 WORK-COMMITTED-WORKS 认不出这些标题里的编号，只能靠"提交同时改了工作文件夹"这一条线索。

做完后：

1. `buildbeat hooks install --repo <path>` 装一个 `commit-msg` 钩子：提交信息末尾没有 `Work:` 时，标题里只写了一个、并且在 `delivery/work/` 下有文件夹的工作编号，就自动补上 `Work: <ID>`；标题里找不到，再看分支名；都没有就不动。钩子是独立的 sh 脚本，不依赖运行时，只用文件的团队可以照指南直接拷。
2. 老提交：没有运行记录、没有 `Work:` 标记、也没改工作文件夹的提交，标题里只写了一个有文件夹的工作编号时，`history --path` 认它是这项工作的，标成 `via subject`，表示这是较弱的线索。WORK-COMMITTED-WORKS 的"有提交"判断也一起认。
3. `accept` 和 `check` 发现最近 50 个提交里有"标题写了编号、末尾没有标记"的，并且钩子没装，就提醒一行，告诉人用上面的命令装钩子；只提醒，不拦。

## 起因

2026-11-05 所有者转来一个业务试点项目的使用反馈（12 条），会话核实后建议先做第 1、2、3 条，所有者说「按推荐起草」。这是第 2 条，反馈原话：「440 个提交里有 405 个在标题里写了〔工作编号〕，但末尾带 `Work:` 的是 0 个。」（〔〕里是把试点自己的编号前缀换成了通称）它建议「提供 `buildbeat hooks install`……另外让 `check` 提示"标题里有编号、末尾没有标记"的提交」。

"老提交按标题编号找回"推翻了 WORK-CODE-TRACE 当时"标题里的编号不算"的决定（理由是标题常常提到别的工作）。会话建议放宽为"只有一个有文件夹的编号才算"，并单独标出；所有者在起草前按推荐确认了这一点。

- related: WORK-CODE-TRACE
- related: WORK-COMMITTED-WORKS

## 已核实的现状（2026-11-05，main `1be6ff7`）

**代码已确认**

- `history --path` 只认三种线索：运行记录的范围、Git 解析出的 `Work:` 标记、提交改了 `delivery/work/<ID>/`（`src/v2/runtime/code-trace.js:304-309`）；文件头注释写明"标题里只是提到一项工作不算"（`src/v2/runtime/code-trace.js:1-10`）。线索说明的输出在 `src/v2/runtime/code-trace.js:356-361`。
- 一次 `git log` 已经读出了每个提交的标题（`src/v2/runtime/code-trace.js:182-207`），加标题线索不用多跑 Git。
- 随包信封的机械提交会带 `Work:`：`templates/v2/envelope/worker.sh:47-55`。
- 文档写着不按标题猜：`docs/v2/guide/11-session-handoff.md:11`（英文版同一处）。手工提交要带标记的说法：`SKILL.md:60`、`docs/v2/guide/12-without-runtime.md:43` 和 `:85`。
- `accept`、`check` 打印提醒的地方：`src/v2/cli/run.js` 里 `accept` 和 `check` 的提醒段（WORK-FOLDER-EXTRAS 加的那几条旁边）。
- 运行时现在不装任何 Git 钩子，也没有 `hooks` 命令（`src/v2/cli/run.js:100-116` 用法）。

**试点仓库（只读，远端开发分支，2026-10-14 到 2026-11-04）**

- 改了 `delivery/` 以外文件的提交约 400 个（含合并提交），带 `Work:` 标记的 0 个。
- 其中 329 个已经能靠"同一提交改了工作文件夹"追到；29 个（17 个普通提交、12 个合并提交）只有标题里写了一个有文件夹的编号，放宽后能追到；41 个标题里没有任何编号，放宽也追不到；标题里写了两个以上有文件夹编号的提交只有 3 个（不算）。
- 标题里常顺带提到别的工作的缩写编号（只写前缀和末尾的数字），缩写在 `delivery/work/` 下没有文件夹，按规则不算，不会误认。
- 项目自己有一个 `pre-commit` 钩子（一次最多提交 40 个文件），没有 `commit-msg` 钩子。

**待确认**

- `git rev-parse --git-path hooks` 在关联工作树里指向共用的钩子目录，装一次所有工作树都生效：在 Run 里用测试确认。

## 范围

包含：

- 新模板 `templates/v2/hooks/commit-msg`（POSIX sh）。
- `buildbeat hooks install`：装钩子。
- WORK-COMMITTED-WORKS 提出的共用"提交 → 工作"函数加 `subject` 线索；`history --path` 输出 `via subject`。
- `accept`、`check` 的提醒。
- 文档：指南 11（接续）改掉"不按提交标题猜"，指南 12（只用文件）加拷钩子的一步，Skill、README 文件说明里提到标记的地方，中英文；CHANGELOG `## Unreleased`。
- 回归测试。

不包含：

- 改写已有提交、补打标记：历史不动。
- 改项目已有的钩子，或改 `core.hooksPath` 指向的、进了 Git 的钩子目录。
- "当前工作"这类新状态文件：钩子只看标题和分支名。
- 发版、推送。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 老提交认不认标题里的编号 | 只在没有其他线索时认；标题里只写了一个、并且在 `delivery/work/` 下有文件夹的编号才算；标成 `via subject` | 维持"标题不算"：试点 29 个提交继续追不到，7 项工作在 WORK-COMMITTED-WORKS 里仍显示草稿 |
| 2 | 钩子从哪取编号 | 先看标题，只认唯一一个有文件夹的编号；没有再看分支名，规则相同 | 另记一个"当前工作"文件：要新状态，多个会话同时用一个仓库时还会互相覆盖 |
| 3 | 钩子怎么写 | 独立 sh 脚本，用 `git interpret-trailers` 加标记，不调用运行时 | 钩子里调用 `buildbeat`：没装运行时的同事一提交就报错 |
| 4 | 装到哪里 | 装到 `git rev-parse --git-path hooks` 给出的目录；那里已有 `commit-msg` 时不覆盖，把脚本另存为 `buildbeat-commit-msg`，打印一行让人加进原钩子；目录在工作树里（进了 Git）时不写，只打印怎么做 | 直接覆盖或追加：可能弄坏项目自己的钩子 |
| 5 | 在哪提醒 | `accept`、`check`，只看最近 50 个提交，钩子已装就不提醒 | 放进 `status`：每次看进度都多一行 |
| 6 | 命令名 | `buildbeat hooks install --repo <path>` | `buildbeat install-hook`：和反馈里的写法不一致 |

**对外名字（接受即确认）**

- 用法行：`buildbeat hooks install --repo <path>`
- 装好：`installed <hooks dir>/commit-msg: a commit whose subject (or branch name) names exactly one work under delivery/work/ gets a "Work: <ID>" trailer`
- 已有 `commit-msg`：`<hooks dir>/commit-msg already exists, left as is; saved the BuildBeat hook as <hooks dir>/buildbeat-commit-msg; add this line to your commit-msg hook: sh "<hooks dir>/buildbeat-commit-msg" "$1"`
- 钩子目录进了 Git：`<hooks dir> is tracked by Git, so nothing was written; copy templates/v2/hooks/commit-msg there as commit-msg (or call it from your existing hook) and commit it with the project's own review`
- `history --path` 线索：`via subject`；`--json` 里线索种类 `"subject"`。
- 提醒：`warning: <n> of the last 50 commits on <branch> name a work in the subject but carry no Work: trailer; buildbeat hooks install --repo <repo> adds the trailer from now on`
- 文档补的说法：「提交标题里写了工作编号、末尾却没有 `Work:` 标记的老提交，`history --path` 也认，但只在没有其他线索、标题里只有一个有文件夹的编号时才认，标成 `via subject`；以后的提交用 `buildbeat hooks install` 装的钩子自动补标记。」英文版：「Older commits that name a work in the subject but carry no `Work:` trailer count too, as `via subject`, but only when nothing else traces them and the subject names exactly one work that has a folder; `buildbeat hooks install` adds the trailer to commits from now on.」

## 验收

机器检查：

- `verify.sh` 全部通过：`npm test`、文档检查、Bash 信封、Claude 插件、安装后首跑，以及本工作范围内的 `git diff --check`（起点 `1be6ff7`）。
- 钩子测试（sh 测试或 node 里起临时仓库）：
  - 标题写了一个有文件夹的编号 → 末尾补 `Work: <ID>`；已经有 `Work:` → 不动；标题写了两个有文件夹的编号 → 不动；标题里的编号没有文件夹、分支名里有 → 用分支名的；都没有 → 不动；`git commit --amend` 再跑一遍不会出现两行标记。
  - 关联工作树里提交同样生效。
- `hooks install` 测试：空目录装成 `commit-msg`；已有 `commit-msg` 时原文件一字不变、另存 `buildbeat-commit-msg`、打印提示；`core.hooksPath` 指向进了 Git 的目录时什么都不写。
- `history --path` 测试：只有标题线索的提交显示 `via subject`、`--json` 种类 `subject`；同一提交还有 `folder` 或 `trailer` 线索时不加 `subject`；标题写两个有文件夹编号的提交仍算"追不到"。
- WORK-COMMITTED-WORKS 的 status：只有标题线索的工作也显示 `COMMITTED`。
- 提醒测试：最近 50 个提交里有标题带编号、没标记的 → `accept` 和 `check` 打印提醒；钩子装了就不打印。
- 新测试在现在的代码上失败（驾驶会话交 Run 前确认，写进 notes.md）。
- 已有测试的断言一条不改照样通过。
- 在试点仓库上只读试跑：一个改动多的代码文件，`history --path` 追到的行数比改动前多（或相同时写明原因）；status 里 `COMMITTED` 比 WORK-COMMITTED-WORKS 单独时多 7 项左右。结果写进 notes.md。
- 独立只读审查没有未裁决的 P0/P1。

要人确认：

- 要不要在试点仓库装这个钩子，由试点所有者决定，这里不装。

## 实施计划

1. `templates/v2/hooks/commit-msg`：读提交信息、已有标记就退出；列出 `delivery/work/` 下的文件夹名，看标题里按整词出现了哪几个（编号不一定以 `WORK-` 开头，所以按文件夹名找，不按前缀猜），正好一个就加标记；否则对分支名做同样的事；用 `git interpret-trailers --in-place --if-exists doNothing`。`history --path` 的标题线索用同一条规则。
2. `src/v2/cli/run.js`：`hooks install` 子命令和用法行；装钩子的逻辑放进 `src/v2/runtime/`。
3. 共用函数加 `subject` 线索；`code-trace.js` 的输出和头注释。
4. `accept`、`check` 的提醒。
5. 文档、CHANGELOG、测试。

驾驶会话亲自写代码，提交带 `Work: WORK-COMMIT-TRAILERS`，以 `run --adopt` 交给 Run；verify 和 review 由独立 worker 执行，收敛后停在合并决定。等 WORK-COMMITTED-WORKS 合入会话分支后再开 Run（第 3 步要用它的共用函数）。

## 停止条件

- 已有测试的断言要改：先停下来问。
- 试点试跑时 `via subject` 明显认错（比如标题提到的是被修的另一项工作）：先停下来问规则。
- 钩子要改项目已有的钩子才能工作：先停下来问。
- 审查轮数上限沿用 run-config（`budgets.reviewRoundsPerWork`）。合并、推送、发布另行决定。
