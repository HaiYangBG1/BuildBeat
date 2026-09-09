# BUILDBEAT.md — 本项目的 BuildBeat 标记

**本项目运行 BuildBeat**：运行时 `@haiyangbg/buildbeat@<X.Y.Z>`（<yyyy-mm-dd> 首次接入；查看本机版本 `npm ls -g @haiyangbg/buildbeat`，查看最新 `npm view @haiyangbg/buildbeat@latest version`）
**装载方式**：会话读根目录 `AGENTS.md`（`CLAUDE.md` 是一行指针）；驾驶手册在 BuildBeat Skill `SKILL.md` §0.5
**活动工作**：`delivery/work/<WORK-ID>/`（intent / plan / run-config / decisions.jsonl / runs/）；信封与 worker 包装在 `delivery/envelope/`
来源：<https://github.com/HaiYangBG1/BuildBeat>

## 升级

运行时升级只是 `npm install --global @haiyangbg/buildbeat@latest`，对项目文件零改动；升级后更新上面的版本行。模板（`AGENTS.md` / `指挥台.md` / `delivery/envelope/`）对照上游 [CHANGELOG.md](https://github.com/HaiYangBG1/BuildBeat/blob/main/CHANGELOG.md) 中「模板」条目手工同步，拿不准就让会话对比上游 `templates/v2/` 与本项目对应文件。事件 schema 只增不改，旧 Run 台账不需要迁移。

## 回灌（比升级更重要）

本项目踩到 BuildBeat **没覆盖的新坑**（新反模式 / 机制漏洞）→ 回上游 `lessons.md` 登记一条（症状 → 根因 → 解药），提 issue / PR 或直接改上游仓。只回灌真实事故，不回灌猜想。
