# WORK-DROP-V2-PATHS 结果

路径里不再带 `v2`：`src/v2/` 是 `src/`，`docs/v2/guide/` 是 `docs/guide/`，台账格式说明是 `docs/SPEC-0001-events-v1.md`，`templates/v2/` 是 `templates/`，57 个测试文件去掉了 `v2-` 前缀。所有者批准的提交是 `70fcaf6`，在会话分支上，还没发版。验证通过，346 项测试全部通过，行为没有变化；独立审查一轮，没有拦批准的问题。

## 定了什么

- 旧路径不留跳转。已接入的项目要自己改两类引用：`templates/v2/…` 改成 `templates/…`，GitHub 上 `docs/v2/guide/…` 的链接改成 `docs/guide/…`。写进了 CHANGELOG。
- 开发不再走 `v2` 分支：从 `main` 开分支、提 PR 回 `main`；CI 和 CodeQL 不再对推送到 `v2` 触发。
- 文档检查和打包测试里各有一处守卫写着旧路径（`tests/check_docs.py`、`tests/pack-firstrun.test.sh`），防止它们回来。所以工作说明里"搜旧路径没有结果"那条验收不完全成立，审查记了一条 P2。守卫留着。
- 改名后 `history --path` 仍追得到原来的工作：Git 认得整文件的改名。
- 源码里按目录层数拼的两处路径（读版本号、找钩子模板）少退了一层，改名时一并改了；这类引用搜 `v2` 搜不到。

## 剩下什么

- 远端的 `v2` 分支和 GitHub 上的分支保护没动，等所有者在 GitHub 上处理。
- `delivery/work/` 里旧记录写的旧路径保持原样。

## 写进了项目哪些文档

- CONTRIBUTING.md @ 44b124b — 开发从 `main` 开分支；台账格式说明的新路径
- docs/RELEASING.md @ 44b124b — 不再说日常开发在 `v2` 分支
- CHANGELOG.md @ 44b124b — 路径怎么变、已接入的项目要改什么
