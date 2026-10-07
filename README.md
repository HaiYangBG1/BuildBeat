# BuildBeat

**会话随时换，项目接着干。**

BuildBeat 面向人和 AI 会话：工作说明和全部记录留在项目文件与 Git 里，实现、验证、审查和修复在会话之外自动推进、随时可恢复，候选带着证据停在你的合并决定前。

## 三个承诺

- **走得开**：一项工作写一份 `work.md`，接受后由 `buildbeat run` 推进。关掉会话、换 AI 工具、换人，都能从项目文件和运行台账接着干；主仓带多个代码仓时，`buildbeat status --repo . --all-repos` 一条命令看全所有仓的待办。
- **回来能信**：验证跑项目自己的命令，结果由运行时从 Git 和台账回读，不听 AI 自述；审查独立、只读。缺工具、后端不可用、审查没交报告，都按环境故障停下等人，不会把环境问题当成代码问题去修。
- **敢拍板**：合并批准绑定你看过的那一版候选（`--candidate`）。在合并决定点发现小问题，可以自己修好交回（`run --adopt`），或一句话退回给修复者（`decide --action fix`），不必重开一轮。合并、推送、发布、部署始终由人决定。

## 开始使用

运行时需要 Node ≥ 20。从 3.x 升级前，先用原来的 3.x 运行时完成或取消仍在进行的 Run（见[迁移说明](docs/MIGRATION.md)）。先读 [SKILL.md](SKILL.md) 与[快速开始](docs/v2/guide/01-quickstart.md)。

```bash
npm view @haiyangbg/buildbeat@latest version
npm install --global @haiyangbg/buildbeat@latest
buildbeat --version
```

```bash
buildbeat accept --repo . --work WORK-X --by owner
buildbeat run --config delivery/work/WORK-X/run-config.yaml
buildbeat status --repo . --work WORK-X
```

## 记录与接续

端到端工作包在 delivery/work/ 保存 work.md、配置、决定、审查问题与终态记录；本机在途事件和日志在 .buildbeat/runtime/，候选在 .buildbeat/worktrees/。`status` 的成本行列出审查轮数、问题数，以及人工等待各自的去向（已决定、被替代、被停掉、仍在等）。换会话前补齐未落盘事实；Git clone 不迁移活动进程和现场。没装运行时的人和工具也能读状态、写工作说明。

[Handoff](docs/v2/guide/11-session-handoff.md) · [Recovery](docs/v2/guide/10-recovery.md) · [没有运行时](docs/v2/guide/12-without-runtime.md)

## 能力边界

BuildBeat 不提供多人账号、角色/权限系统，不采集或上传项目使用数据，没有遥测采集。模型和鉴权由配置的 AI 工具提供。合并、推送、部署、发布分别由获授权的外部操作完成；上线后可用 `buildbeat release` 记录项目自己的回读，回读通过才关窗。生产巡检和任意工作流/规则语言不在产品范围内。

[Capabilities](docs/CAPABILITY-MATRIX.md) · [Security](docs/v2/guide/09-security-boundaries.md) · [Migration](docs/MIGRATION.md)

## Claude Code 插件

插件提供 Skill、模板与文档，运行时单独安装。

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

[Contributing](CONTRIBUTING.md) · [MIT](LICENSE)
