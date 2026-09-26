# Phase 1 file-bus pilot — 2026-08-24

> 历史证据：本报告早于 2026-08-25 BuildBeat 改名。文件总线 finding 结论仍可复用，但其中旧产品名或旧 namespace 不构成 BuildBeat canonical 路径的验证。

## 目的与边界

本试点验证 Phase 1 工作区候选的 Gate、完成证据、引用、L3、coverage、JSON 与 strict 语义。全部运行都发生在 `mktemp` 临时副本或本地共享 clone 中；真实项目只被读取。试点没有修改源项目、安装脚本、提交、push、合并、发布、部署、访问生产或打开常态流量。

所有命令均设置 `BUS_CHECK_NO_FETCH=1` 与 `BUS_CHECK_NO_LIVE=1`，因此 `coverage.complete=false` 是预期边界，不能被解释为项目全绿。三个源目标在试点命令前后的 `HEAD + git status --porcelain=v1 -z` 摘要完全一致，机器断言为 `source_state_unchanged=true`；多仓目标同时核对 meta 与四个子仓。

## 结果

| 目标 | 试点形态 | 结果 | 可外推边界 |
|---|---|---|---|
| 教学 `example/` | 复制沙盘、注入当前模板脚本 | strict exit 1；11 个示意 commit 全部命中 `sync.ghost_hash`；另保留 L3/离线/线上/漂移 `unverified` | 证明教学假 hash 不会被当真；不证明任何真实项目或部署状态 |
| 活跃多仓协调项目 | 复制当前协调层文件；只读复用 meta/四子仓 Git 对象；保留项目自有旧版 `verify-status.sh` | strict exit 1；4 个 NOW 引用命中 `ref.broken`，四条 legacy Gate 命中 `gate.line_missing`；旧 verify 机器协议、离线、线上与漂移边界均显式 `unverified`；没有幽灵 hash 误报 | 这是旧项目迁移清单，不是对业务候选、L3/L4、Gate3 或生产健康的裁决；真实项目未执行迁移 |
| 真实单仓代码树投影 | 从现有单仓做本地共享 clone，叠加 canonical 单仓协调骨架 | 基线 strict exit 0，只有 4 个预期 `unverified`；依次注入三种不一致后，分别且仅新增 `evidence.missing`、`gate.na_without_reason`、`sync.ghost_hash`，三次均 strict exit 1 | 证明检查在真实 Git/代码树规模上仍保持稳定；投影骨架不等于该项目已安装或已接管 Solobaton |

## 试点反馈回灌

真实多仓投影把第一版扫描器的高噪声暴露出来，候选已同步收敛：

1. `pm/decisions.md` 只检查最新三条 dated row，避免历史文件按换期归档后反向阻断当前工作；全仓 Markdown 链接完整性仍由 `tests/check_docs.py` 负责。
2. wildcard、占位符、超长表格残片和纯 prose 不再冒充 regular-file reference；存在的 source-relative/root-relative/core contract 路径可安全解析。
3. canonical Gate/证据路径继续要求仓库根相对路径；绝对路径、`../`、越界 symlink 与真实缺文件仍是 `ref.broken` conflict。NOW 模板的契约指针已改成 `contracts/PROTOCOL.md`。
4. 旧版 project-owned `verify-status.sh` 即使忽略 `--format=machine` 并 exit 0，也会被识别为协议未接入的 `sync.unverified`，不会静默冒充 fresh L3。

## 结论

WP1.6 的只读试点通过：三类目标均按预期产生稳定 JSON、coverage 和 strict 结果；三个人工不一致各自命中唯一目标 conflict；真实源项目 Git 可见状态不变。Phase 1 因此可以形成稳定源码候选。

这不是 v1.18 发布、已安装项目迁移、外部 adapter 验收或生产签字。tag、GitHub Release、npm publish 与任何真实项目写入仍需单独人工授权；活跃多仓项目列出的 Gate/引用/verify 迁移债务也必须在它自己的工作包与写边界内处理。
