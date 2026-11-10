# 从这一版起只认当前写法：去掉旧版本兼容和历史文档

## 目标

新来的人和新会话打开这个项目，现在会先撞上一堆只对老版本有意义的东西：Skill 开头是 3.x、4.x、5.x 三套说明，命令有新旧两套名字，仓库里有几十份早期方案和每次发版的证据。这些兼容当初是为"万一有人还在用旧版"留的，实际上没有这样的人。

做完后：运行时、Skill 和文档只讲当前这一种写法；旧版本留下的记录仍在 Git 里，不删不改，已关的旧工作照样能从 `status` 和 `history --path` 查到。

## 起因

2026-11-10 所有者：「历史迁移的兼容日志，因为当前除了我没人用，所以正好可以切干净，给未来的人一个干净的开始，从这个版本砍断牵绊，然后做减法清单」。

## 已核实的现状（2026-11-10，main `2e0d984`）

**已确认**

- 没有别人在用：GitHub 上 0 fork、0 issue，PR 全部来自所有者和 dependabot（当天用 `gh` 查的）。
- 旧命令名还在分发：`src/v2/cli/run.js:2016-2089` 处理 `observe`、`findings`、`start`、`resume`、`inbox`、`approve`、`reject`、`doctor`、`events`、`replay`、`metrics`、`overview`、`preflight`；帮助末尾 `src/v2/cli/run.js:124` 写着旧写法仍是别名。
- 旧配置还在解码：`src/v2/engine/workflow.js:36` 的旧流程图（入口 `intent`/`spec`/`plan`），`src/v2/engine/risk-preset.js` 的 `riskPreset` 换算，`src/v2/policy/policy.js:221` 和 `src/v2/cli/run-config-check.js:181` 的 `policies:` 报错。
- 旧运行的特判：`src/v2/cli/run.js:918`、`src/v2/cli/run.js:1062`、`src/v2/runtime/decisions.js:326`、`src/v2/runtime/decisions.js:433`（3.x 台账要用 3.3.1 跑完），`src/v2/cli/run.js:1772`、`src/v2/runtime/notify.js:96-127`（4.x 台账缺字段时的补法）。
- 旧记录的读法：`src/v2/runtime/facts.js:164`、`src/v2/runtime/threads.js:49`、`src/v2/runtime/code-trace.js:171`、`src/v2/runtime/overview.js:268` 在没有 work.md 时读 intent.md / plan.md。
- 本仓 39 项工作里 14 项是旧格式（intent.md + plan.md + workflow.yaml）。`status --repo . --json`：38 项 `CLOSED`、1 项 `NO_INTENT`，没有在跑的；39 项都有 result.md。
- 旧工作现在追得到：`history --repo . --path src/v2/engine/yaml-subset.js` 列出 `WORK-YAML-SUBSET` 和 `WORK-REVIEW-CLEANUP`，标题取自 intent.md。
- 文档：`SKILL.md:10-28` 是按版本分的说明；`docs/MIGRATION.md` 7 KB；`CHANGELOG.md` 105 KB、`CHANGELOG-v1.md` 56 KB；`docs/history/` 49 个文件、`docs/releases/` 29 个文件；`package.json:14-16` 把迁移说明打进 npm 包。指南 01、02、10、能力矩阵、`docs/RELEASING.md`、`tests/check_docs.py`、`tests/v2-package-files.test.js` 有指向这些文件的链接或检查。
- 23 个测试文件提到旧写法，`tests/v2-simplified-surface.test.js` 最多。

**待核**

- `status` 读每项工作的 run-config.yaml；旧配置里的 `workflow:`、`riskPreset:` 在去掉解码后会不会让整份列表报错。开工第一步用本仓 14 项旧工作验证。
- 试点工作区有多少旧格式的工作、有没有没关窗的、有没有停着没跑完的旧运行。要读那几个仓，开工前由所有者同意，只读。

## 范围

包含：

- 删掉上面列的旧命令名、旧配置解码、旧运行特判，以及只为它们存在的测试。
- 旧记录的读法换成第 1 项的做法。
- 删掉第 5 项列的历史文档，修好指向它们的链接和检查；`CHANGELOG.md` 重新起头；`SKILL.md`、README（中英）、指南、能力矩阵、`package.json` 的 `files` 同步。

不包含：

- 改写或删除任何工作文件夹里的旧记录。
- 路径里的 `v2`（`src/v2/`、`docs/v2/guide/`、`templates/v2/`）改名：放在减法之后、发版之前做，那时文件最少。
- 不再让 `v2` 分支跟着 main：要所有者自己删远端分支，另说。
- `lessons.md` 里提到已退役命令的条目（约 11 行）：归到减法清单一起看。
- 交付循环的减法：下一项工作。
- 发版、推送、版本号（见第 7 项）。

## 开工前待拍板

接受本说明即按「推荐」执行；要改哪项直接说，改完表再接受。

| # | 问题 | 推荐 | 另一种做法与后果 |
|---|---|---|---|
| 1 | 已关的旧格式工作还认不认 | 运行时不再读 `intent.md`、`plan.md`、`workflow.yaml`。已关的旧工作靠 `result.md` 和运行记录继续出现在 `status` 和 `history --path` 里，标题取 `result.md` 第一行 | 继续读旧文件：运行时一直背两种写法。把旧文件改写成 `work.md`：改了已接受的记录，当时的指纹对不上 |
| 2 | 旧格式又没关窗的工作怎么显示 | `status` 列出编号，阶段写 `LEGACY`，下一步写 `legacy records: read the folder, or close it with a result.md`；仍可关窗 | 开工前先把这类工作全部关掉：多一轮人工，试点数量待核 |
| 3 | 旧命令名 | 全部删掉，按未知命令处理：打印用法，退出码非 0 | 留一版只提示"改用哪个"：以后还要再删一次 |
| 4 | 旧配置项 `workflow:`、`riskPreset:`、`policies:` | `check` 和 `run` 报 `unknown key`；`status` 读旧工作的配置时跳过这些键，不报错 | 继续解码：`workflow.js` 和 `risk-preset.js` 的旧分支留着 |
| 5 | 历史文档 | 删掉 `docs/MIGRATION.md`、`CHANGELOG-v1.md`、`docs/history/`、`docs/releases/`、`docs/v2/` 下的 RFC、SPEC 和 M 开头的验收记录。`CHANGELOG.md` 从这一版重新写，开头一行：`Earlier history: see tag v5.5.0.` | 挪进 `docs/archive/`：还在仓库里，新来的人照样会翻到 |
| 6 | `SKILL.md` 的「运行时版本」一节 | 换成一句：先跑 `buildbeat --version`，低于这一版就升级；升级前用旧版把在跑的工作跑完或取消 | 保留分版本说明：每个会话继续读约 2 KB 用不上的内容 |
| 7 | 版本号 | 这项工作不发版，和接下来的减法一起发成 6.0.0，只断一次 | 现在就发 6.0.0：减法做完又是一个主版本 |

## 验收

机器检查：

- `npm test`、`npm run check:docs`、`npm run test:envelope`、`npm run test:plugin`、`npm run test:pack-firstrun`、`npm run pack:check` 全过。
- 本仓 `status --repo . --json` 仍是 39 项，38 项 `CLOSED`；原来的 `NO_INTENT` 那项按第 2 项显示。
- 开工前对 5 个由旧工作写出的文件记下 `history --path --json` 的输出，改完后列出的工作编号和行数不变。
- `buildbeat overview --repo .` 退出码非 0 并打印用法。
- `grep -rnE "3\.3\.1|MIGRATION\.md|intent\.md|plan\.md" src bin SKILL.md` 没有结果。
- `npm pack --dry-run` 的清单里没有 `docs/MIGRATION.md`。

由人确认：

- 试点工作区只读试跑的结果（多少项工作的显示变了）所有者看过。

## 实现步骤

1. 记基线：本仓的 `status --json` 和 5 个文件的 `history --path --json`；所有者同意后，试点仓只读跑同样的命令。
2. 验证待核的第一条，再删旧命令名、旧配置解码、旧运行特判和对应测试。
3. 换掉旧记录的读法，补测试：旧格式已关、旧格式未关、只有 `result.md` 三种夹具。
4. 删历史文档，修链接和检查，重写 `CHANGELOG.md` 开头，同步 Skill、README、指南、能力矩阵、`package.json`。
5. 对比基线，写 `result.md`。

## 停止条件

- 试点里有旧格式、没关窗、还要接着做的工作，或有停着的旧运行不能取消。
- 去掉某段兼容后，本仓已关的工作在 `status` 或 `history --path` 里消失，或追到的行数变少。
- 要改写已接受的旧记录才能通过。
- 要删的东西超出上面的清单。
