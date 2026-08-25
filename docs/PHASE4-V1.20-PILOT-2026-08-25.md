# Phase 4 / BuildBeat v1.20 真实升级与多仓刷新证据（2026-08-25）

> 证据等级：本机真实 Git 项目 + 当前 `1.20.0` 源码 checkout + 只读多仓投影。本文证明机械升级的真实版本增量路径和检查器在真实协调层上的行为，不证明 npm/GitHub 发布、部署、生产状态或人工 Gate。

## A. schema 2 真实版本增量升级

| 项 | 观测值 |
|---|---|
| 目标 | `/Users/zhouhaiyang/Downloads/buildbeat测试/init` |
| 升级前基线 | `main@4ea29a94a3a29fa905ae99662359ec561298135d`，schema `2`，scaffold `v1.16`，CLI `1.16.3` |
| 专用分支 | `buildbeat-v1.20-upgrade` |
| 升级来源 | 当前源码 `@haiyangbg/buildbeat@1.20.0`，scaffold `v1.20` |
| 关闭提交 | `a136ff6f33d5814d36593f85a3b9ec2f1e223827`（`chore: pilot BuildBeat v1.20 upgrade`） |
| 远端边界 | 目标仓无 remote；未 push、未部署 |

执行与结果：

1. 默认 `upgrade --dry-run --json` 正确判定同 major 的 `v1.16 → v1.20` 可升级，并对 `.gitignore`、`AGENTS.md`、`scripts/drift-check.sh`、`指挥台.md` 四个已改文件 fail-closed；`contracts/PROTOCOL.md` 与 `pm/当期看板.md` 只报告 project-owned 迁移提醒。
2. `--force --dry-run` 只把四个 replace/merge 冲突转为可执行计划，没有把 project-owned 文件纳入写入。
3. `--force` apply 后立即按 Git diff 逐项回灌项目事实：无子仓、真实测试范围、规则 9、部署不适用、`drift-check` 的空应用列表和指挥台项目状态。manifest 最后写入并升为 scaffold `v1.20` / CLI `1.20.0`。
4. `contracts/PROTOCOL.md` 与 `pm/当期看板.md` 在 `main...HEAD` 的 diff 行数为 `0`；最终提交只含 manifest、`AGENTS.md`、`BUILDBEAT.md`、两个脚本和`指挥台.md`。
5. `buildbeat doctor --json`：`ok=true`，`errors=0`，`warnings=0`，namespace=`buildbeat`，manifest validation issues=`[]`。
6. 项目 `bus-check --format=json --strict`：exit `0`，`conflict=0`，`error=0`，`warning=2`，`unverified=3`，`coverage.complete=false`。两个 warning 是 legacy Gate 决策行引用不够精确；三个 unverified 来自显式跳过远端、live 与生产漂移读取，均未被伪装成全绿。
7. 提交后再次 dry-run：版本门为 `up-to-date`，`ready=true`，`writesPerformed=false`，operations/conflicts/blockers 均为空。目标分支 clean、无 remote。

因此，“只有 disposable fixture、没有真实旧 schema 2 → 新 bundle 版本增量”的证据缺口已经关闭。该结论不把 `coverage.complete=false` 外推为完整业务或线上验收。

## B. 真实多仓 / 扫描边界刷新

刷新对象为 `/Users/zhouhaiyang/Documents/Obsidian Vault/AI底座/底座`。为避免改动一个约 `4.6G` 且带本地在途工作的真实协调仓，本次建立只读投影：复制 meta/subrepo Git object、`pm/`、`contracts/`、项目脚本及四个已发现子仓 `ai-admin`、`chickDEV`、`lxj-CLI`、`ruoyi-ai` 的顶层版本来源；只用当前候选 `bus-check.sh` 替换投影中的检查器。原仓零写入、零 stage、零 commit。

首轮刷新发现当前检查器把 legacy prose 中实际留在根内的 `../contracts/...` 链接误判为 traversal。源码随后收窄为：canonical Gate/evidence 仍只接受仓根相对路径；只有 scoped legacy prose 可以解析 `../` / `./`，且 realpath 必须留在协调根内，symlink/权限边界仍不跟随。新增“根内 parent link 通过、根外逃逸阻断”回归后，Shell 套件为 `222/222`。

修复后最终只读刷新结果：

| 维度 | 结果 |
|---|---|
| strict | exit `1`，`blocked=true` |
| findings | warning `4`、unverified `8`、conflict `1`、error `0` |
| coverage | `complete=false`，reason=`sync.unverified` |
| 唯一 conflict | `pm/NOW.md` 引用根内不存在的 `lessons.md` |
| canonical Gate | 当期 legacy 看板缺少四条机器态行，精确报告为 4 个 warning |
| 多仓 join | 四个真实子仓均被发现，但项目尚无 `buildbeat-multirepo-map:v1`，逐仓保留 unverified |
| 适配器 | 项目旧 `verify-status.sh` 尚未返回当前机器协议；live/remote/生产读取按本次只读边界显式跳过 |

最终剩余的 strict 冲突来自目标项目真实断链，而不是投影漏拷或检查器误判。刷新完成的含义是“当前候选能在真实异构协调层上给出精确、非冒进结果”，不是“该业务仓已全绿”；修复业务仓的 `lessons.md` 指针、补多仓 map 或升级项目适配器不属于 BuildBeat 分发迁移的写入授权。

## 结论边界

- 已验证：真实 schema 2 项目从 `v1.16 / 1.16.3` 机械升级到 `v1.20 / 1.20.0`，项目所有权和 Git 边界成立；真实多仓刷新能诚实阻断真实断链并显式暴露未验证范围。
- 未验证：`@haiyangbg/buildbeat@1.20.0` registry artifact、Trusted Publisher、provenance、签名、隔离安装、GitHub tag/Release 与旧包 deprecation。它们须在外部分发 Gate 中逐项回读。
- 不可外推：本文不证明任何业务仓 Gate、部署、生产健康或常态流量。

## 后续状态

上述“未验证”是本试点关闭时的证据边界，未被倒改。后续 WP4.3 外部分发已逐项完成并独立读回，见 [`WP4.3-RELEASE-EVIDENCE-2026-08-25.md`](WP4.3-RELEASE-EVIDENCE-2026-08-25.md)；发布结果仍不能反向扩大本页对业务仓 Gate、部署或生产状态的结论。
