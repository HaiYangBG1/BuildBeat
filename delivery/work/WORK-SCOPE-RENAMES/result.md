# WORK-SCOPE-RENAMES 结果

范围检查现在看得到挪动的两边。把范围外的文件挪进 `allowedPaths`，原来那个位置算删除，会以 `out-of-scope changes: <原路径>` 拦下。路径按 NUL 原样读，带引号、制表符、` -> ` 或首尾空格的文件名照原样比对，未跟踪的文件逐个列出，不受个人 Git 设置影响。`history --path` 不再因为用户设了一个仓里没有的 `blame.ignoreRevsFile` 而报错；把文件挪出工作文件夹的提交，也能找回对应的工作。

候选 4e8236b 在 RUN-SCOPE-RENAMES-01 跑了两轮。第 1 轮 codex 只读审查提了 1 条 P1，修复后第 2 轮 0 条，verify 两次都过。所有者看过 CONTRIBUTING.md 的措辞后批准（D-RUN-SCOPE-RENAMES-01-3）。候选先以 b219496 合入工作分支，再经 PR #116 以 merge commit 5a5f392 进 main，v2 已快进。未发版。

## 定了什么

- 开工前七项按推荐执行。说明 2026-10-25 起草，所有者当天接受（A-WORK-SCOPE-RENAMES-1）；之后一直留在一个已不活跃的会话分支上，11-01 原样搬过来开跑，内容没改。
- 挪动算两处改动，属于行为变化：原来那个目录也要写进 `allowedPaths`。扫了本仓 35 个运行记录里的 45 处改名或复制，都在各自的范围内，以前没有一次会被拦。
- 只用 NUL 分隔。审查第 1 轮指出，加了 `-z` 以后，`history --path` 读日志时仍按 0x1e/0x1f 切分；文件名里含这两个字节（合法）时会崩。这个问题是本次改动引出来的：不加 `-z` 时 Git 会把这些字节转义，不会原样出现。现在每个提交以一个空字段开头，路径不会为空，所以空字段一定是下一个提交的开头。
- Git 最低版本：范围检查要 2.18（`status --no-renames`），`history --path` 要 2.23（`blame --no-ignore-revs-file`）。两条按 Git 仓库各版本的文档核实，写进了 CHANGELOG。
- 新的 status 调用在本仓 673 个文件上每次多 7.7 ms。

## 剩下的

- 发版：等所有者决定。新的范围检查要到发版后的运行时才有。
- 快速开始只写了「Git」，没写最低版本；目前只有 CHANGELOG 里有。要不要写进快速开始，下次碰到相关文档时再定。
- `history --path` 遇到 Git 报错时只显示 "Command failed"，原文被丢掉了；SHA-256 仓的 blame 只认 40 位提交号。这两件说明里已划出范围外，要做就另起一项。
- CONTRIBUTING.md 那条规则里还写着「`-z` or `-c core.quotePath=false` for paths」。这次查实，后者管不了引号和制表符。要不要改成只推荐 `-z`，所有者还没定。

## 写进项目的

- CONTRIBUTING.md @ ecd10c9 — 「解析给人看的 Git 输出」那条规则补了两项：`blame` 加 `--no-ignore-revs-file`，`status` 写明 `--untracked-files=<mode>`
