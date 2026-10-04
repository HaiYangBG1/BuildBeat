# BuildBeat

**会话随时换，项目接着干。**

BuildBeat 面向人和 AI 会话，把工作上下文留在项目文件中，自动推进可恢复的交付循环，带证据交给人决定。

## 三个承诺

换会话能接着干；实现、验证、审查和修复自动推进；候选和证据就绪后再做决定。

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

端到端工作包在 delivery/work/ 保存 work.md、配置、决定与终态记录；本机在途事件和日志在 .buildbeat/runtime/，候选在 .buildbeat/worktrees/。换会话前补齐未落盘事实。Git clone 不迁移活动进程和现场。

[Handoff](docs/v2/guide/11-session-handoff.md) · [Recovery](docs/v2/guide/10-recovery.md)

## 能力边界

BuildBeat 不提供多人账号、角色/权限系统，不采集或上传项目使用数据，没有遥测采集。模型和鉴权由配置的 AI 工具提供。合并、推送、部署、发布分别由获授权的外部操作完成。生产巡检、上线专用流程和任意工作流/规则语言已移出产品。

[Capabilities](docs/CAPABILITY-MATRIX.md) · [Security](docs/v2/guide/09-security-boundaries.md) · [Migration](docs/MIGRATION.md)

## Claude Code 插件

插件提供 Skill、模板与文档，运行时单独安装。

```text
/plugin marketplace add HaiYangBG1/BuildBeat
/plugin install buildbeat@buildbeat-plugins
/buildbeat:buildbeat
```

[Contributing](CONTRIBUTING.md) · [MIT](LICENSE)
