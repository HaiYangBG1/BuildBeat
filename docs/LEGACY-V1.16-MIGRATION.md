# v1.16 legacy 拷出项目迁移指南

> 适用于已把 BuildBeat/Solobaton v1.16 模板拷进业务仓、但没有真实 schema 2 `.buildbeat/manifest.json` 基线的项目。本页是迁移手册，不是执行授权。

## 先判定你在哪条路

| 现状 | 路径 | 结果 |
|---|---|---|
| 只有 `SOLOBATON.md` / `BUILDBEAT.md`，无真实 schema 2 manifest | **A. 继续 legacy 手工维护（默认推荐）** | 不改变所有权；以后继续按 CHANGELOG 手工合并 |
| 已确认要让后续版本进入机械 `upgrade` | **B. 受控重建 schema 2 基线** | 专用 Git 分支上重走 `adopt`，审查后才合并 |
| 已有 CLI 真实写入的有效 schema 2 manifest | 不属本页 | 待有更新且已验证的 bundle 时才可按 [`CLI.md`](CLI.md) 运行 `upgrade` |

已发布的 `solobaton@1.16.3` v0 仍只读。scoped BuildBeat `1.20.0` 已完成“真实旧 schema 2 版本 → 新 bundle”的独立项目试点，见 [`PHASE4-V1.20-PILOT-2026-08-25.md`](PHASE4-V1.20-PILOT-2026-08-25.md)；但该试点不把没有真实 manifest 的 v1.16 legacy 项目自动变成可升级项目，registry artifact 也仍须独立回读。

## 红线：不猜历史所有权

- 不得把 `.solobaton/manifest.json` 直接改名为 `.buildbeat/manifest.json`；历史 schema/namespace 不会因改名变成新基线。
- 不得手写 manifest、复制 `example/.buildbeat/manifest.json`，或把当前已改过的文件 hash 当成“安装时 baseline”。
- 不得同时保留 BuildBeat 与 Solobaton 两份 marker/manifest；混合安装必须 fail-closed。
- 不把 `doctor`、绿测试、manifest 或 `bus-check --strict` 单独当成人工 Gate、部署或线上健康证据。

## A. 继续 legacy 手工维护

1. 保留现有 marker 与项目文件，不生成 manifest。
2. 从已安装版本往后逐版阅读 `CHANGELOG.md` 的“拷出项目升级”，按下表处理。
3. 更改前保留 clean Git checkpoint；更改后运行项目自身测试、`bus-check --format=json --strict` 与人工 Gate。
4. 将“无 manifest，后续机械 upgrade 不可用”作为明示边界，而不是待修的假阻塞。

| 类别 | legacy 迁移动作 |
|---|---|
| `replace-if-unmodified` | 只有确认项目从未修改时才可整文件替换；无法证明就停下做语义合并 |
| `project-owned` | 只人工合并必要的新字段/规则；不覆盖项目事实、契约、看板、决策、status 和已配置验证命令 |
| `merge-only` | 只审查并维护 `.gitignore` 中唯一明确标记的片段；不覆盖 host 文件 |
| optional standards / ADR | 未启用保持缺失；启用时只复制选中模板并填项目事实，已有同名文件不覆盖 |
| Hook | 始终在 manifest 之外；检查并保留既有 Hook 链后手工安装 |

## B. 受控重建 schema 2 基线

只在项目所有者明确批准“重建基线”后执行；这不是 `upgrade` 的自动降级路径。

1. 确认目标仓已有可回退的 clean commit，新建专用迁移分支；记录旧 marker、布局、协调文件、脚本改写、`.gitignore` 片段、Hook 链和未验证范围。
2. 将旧协调层的规划目标路径从原位移出，保留在 Git 历史或明确备份位置。`.gitignore` 只在 marker 唯一且边界可确认时移除旧的 BuildBeat/Solobaton 片段，逐字节保留片段外内容；marker 重复/不完整就停下人工核对。把这些变更形成一个单独可审查、worktree clean 的 checkpoint；不删业务代码，不清空未知目录。
3. 仅从已锁定的 BuildBeat checkout 运行 `node <verified-buildbeat-checkout>/bin/buildbeat.js adopt <project-root> --dry-run --json`；若 scoped registry artifact 已独立回读，也可锁定 `@haiyangbg/buildbeat` 的精确版本。复核 layout、全部 collision/blocker、Git 状态、`.gitignore` 与 `pendingPlaceholders`。不将 `npx solobaton@latest` 当成可写命令。
4. 同一屏计划获明确确认且 dry-run 无 blocker 后，才在该分支执行交互 apply；非交互 `--yes` 只能复用这次确认。CLI 最后写入 schema 2 manifest，不安装 Hook，不跨 Gate。
5. 从迁移前 checkpoint 人工回灌项目事实、契约、决策、status、已配置测试和必要的自定义脚本。被项目改写的 `replace-if-unmodified` 文件以后可能进入冲突报告，这是正常的所有权保护。
6. 可选 standards/ADR 按需手工恢复；填完 `pendingPlaceholders`，配置真实 `verify-status.sh` 与保留既有链的 pre-commit Hook。
7. 运行项目自身验证、`buildbeat doctor`、`bus-check --format=json --strict`、manifest/hash 回读和 Git diff 审查。`coverage.complete=false` 时保留未验证边界，不得报“全绿”。
8. 只在同一候选、人工 Gate 和回退方案都齐备后合并迁移分支。本流程不授权部署、push、tag、GitHub Release、npm publish 或远端改名。

## 回退与完成口径

- 回退优先放弃未合并的迁移分支，或用新的 revert 提交撤销已合并变更；不用破坏性 reset 覆盖其他人工作。
- “建立 schema 2 基线”只表示生命周期所有权可被机械读取。它不证明业务正确、L3/L4 足够、Gate 已批、已部署或线上正常。
- 后续只有在“真实 schema 2 基线 + 更新且已验证的 bundle + clean Git”同时成立时，才进入机械 `upgrade`；跨 major 仍需额外显式确认。
