# WP4.3 BuildBeat scoped 分发关闭证据（2026-08-25）

> 证据等级：GitHub / npm 可变远端的当次独立读回 + 不可变 annotated tag + 官方 registry artifact + 本地隔离安装。本文关闭 BuildBeat 外部分发迁移，不证明任何业务项目 Gate、部署、生产健康或常态流量。

## 1. Canonical 标识

| 项 | 已验证结果 |
|---|---|
| 产品 / CLI | BuildBeat / `buildbeat` |
| GitHub 仓库 | [`HaiYangBG1/BuildBeat`](https://github.com/HaiYangBG1/BuildBeat) |
| npm package | [`@haiyangbg/buildbeat`](https://www.npmjs.com/package/@haiyangbg/buildbeat) |
| legacy compatibility | 包内继续提供 `solobaton` executable；旧 npm 包 `solobaton` 保留但已 deprecate |
| 发布版本 | `1.20.0`，scaffold `v1.20` |

旧 GitHub 地址 `https://github.com/HaiYangBG1/solobaton` 在关闭时返回 `301` 并重定向到新仓库；这是可变远端行为，未来使用前仍须重新检查。

## 2. 仓库、tag 与发布工作流

| 项 | 已验证结果 |
|---|---|
| `main` 发布提交 | `5aaa9e8ec96113970e7ce0ed0e43bec86a8743a0` |
| annotated tag | `v1.20.0`，tag object 精确指向上述提交 |
| tag ruleset | `Protect release tags` active，include=`refs/tags/v*`，rules=`update,deletion`，bypass actors 为空 |
| 发布工作流 | [`Publish BuildBeat scoped npm package` run 32826832379](https://github.com/HaiYangBG1/BuildBeat/actions/runs/32826832379) |
| GitHub Environment | `npm-publish`，仅 protected branches，required reviewer；本次 run 由当前授权 reviewer 对唯一 pending deployment 批准 |
| publish job | success；tag / checkout / event SHA / `origin/main` / package version 全等检查通过 |
| verify job | success；exact artifact、provenance、隔离安装、registry signature 与 attestation 全部通过 |
| GitHub Release | [`BuildBeat v1.20.0`](https://github.com/HaiYangBG1/BuildBeat/releases/tag/v1.20.0)，非 draft、非 prerelease、标记为 latest |
| Publishing access | `Require two-factor authentication and disallow bypass 2fa tokens (recommended)` 已独立读回为 checked；OIDC Trusted Publisher 保持可用 |

npm Trusted Publisher 当次读回为 GitHub Actions、repository `HaiYangBG1/BuildBeat`、workflow `publish.yml`、environment `npm-publish`、permission `createPackage`。绑定和包设置属于可变状态，未来发布前必须重新读回，不能只引用本文。

## 3. npm bootstrap 与正式 artifact

为先建立 scoped package 再绑定 Trusted Publisher，使用只有 `README.md` 与 `package.json` 的最小 `0.0.0` 占位包。它不提供 CLI、不对应 Git tag、没有 retroactive provenance，只保留 `bootstrap` dist-tag。

本次首包有一个需要保留的实际偏差：尽管命令显式使用 `--tag bootstrap`，npm 首次创建 package 后仍短暂返回 `latest=0.0.0`；带 2FA 的 `npm dist-tag rm ... latest` 被 registry 以 `400` 拒绝。没有删除或重发版本，也没有把占位包写成正式入口。随后 `1.20.0` 通过 OIDC 正式发布并接管 `latest`，最终读回为：

```json
{
  "bootstrap": "0.0.0",
  "latest": "1.20.0"
}
```

正式 artifact 的独立 registry 读回：

| 字段 | 值 |
|---|---|
| name / version | `@haiyangbg/buildbeat@1.20.0` |
| repository | `git+https://github.com/HaiYangBG1/BuildBeat.git` |
| integrity | `sha512-Q9hcRNSwuhYulNR7+XxAyILSmujzhj01tDqHR+C8RgROSdP99O/oAhZgSpiHW441jdvCWPmnl4yDvtQGpfffUg==` |
| shasum | `dc0c960f4f12a08b0733515dddb5614313a85381` |
| attestation URL | `https://registry.npmjs.org/-/npm/v1/attestations/@haiyangbg%2fbuildbeat@1.20.0` |
| provenance predicate | `https://slsa.dev/provenance/v1` |

工作流外的本地隔离安装再次证明：`buildbeat --version` 与包内兼容入口 `solobaton --version` 均返回 `1.20.0`；`npm audit signatures` 返回 1 个 verified registry signature 和 1 个 verified attestation。由该安装运行 `doctor` 得到合法 schema 2 JSON；对没有 lifecycle manifest 的源仓根诚实返回 exit `1`，执行前后 Git 可见状态完全一致，未把诊断失败伪装成绿灯或写入项目。

registry README 也单独读回了 `# BuildBeat`、`HaiYangBG1/BuildBeat`、`npm view @haiyangbg/buildbeat@latest version` 及 `npx --yes --package=@haiyangbg/buildbeat@latest buildbeat ...`，证明 npm 落地页不是 bootstrap README 或旧包文案。

## 4. Legacy npm 包退场

旧包没有 unpublish，`latest` 仍为 `solobaton@1.16.3`，既有只读安装继续可解析。`1.16.1`、`1.16.2`、`1.16.3` 三个版本已逐一读回相同 deprecation 文案：

> Solobaton has moved to @haiyangbg/buildbeat. Install @haiyangbg/buildbeat and use the buildbeat CLI; this package remains available for legacy read-only compatibility.

旧包不会获得 BuildBeat `1.20.0` 的项目写入或机械升级能力，也不会通过 unpublish 破坏历史消费者。

## 5. 关闭结论与边界

- 已验证：新仓库名、旧 URL 重定向、scoped public package、Trusted Publisher、最严格 publishing access、受保护 annotated tag、OIDC 发布、最终 dist-tags、exact integrity、SLSA provenance、registry signature、attestation、隔离安装、GitHub Release 和 legacy deprecation。
- 持续要求：发布前重新检查 GitHub tag ruleset、Environment、npm Trusted Publisher、package publishing access、dist-tags 与目标版本是否已存在；可变设置不能由本次截图、日志或文档永久代表。
- 不可外推：本次发布不替任何业务项目批准 Gate，不证明真实业务仓已升级，不证明部署、生产健康或常态流量。
