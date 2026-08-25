# CLI 策略调研：AI 工作流项目官方能力对照（2026-08-24）

> 目的：为 BuildBeat CLI 边界决策提供可复核的产品事实。
> 证据边界：仅核对文末列出的官方仓库文档与源码页面；“未见”只表示这些页面没有记录该能力，不外推为整个市场不存在。星数等易漂移指标不作为架构依据。
> 结论一句话：**三家都用 CLI 降低安装或更新成本，但命令面宽度并不相同；可迁移到 BuildBeat 的共同部分，是确定性脚手架/更新、明确的文件所有权，以及把项目语义留给 agent/Skill。**
> 本调研支持 2026-08-24 的“选择性解冻”决策，但不把竞品实现当作 BuildBeat 必须复制的功能清单；执行边界见 [`EXECUTION-PLAN.md`](EXECUTION-PLAN.md)。

---

## 1. 三家官方项目对照

| 维度 | GitHub Spec Kit | OpenSpec | BMAD-METHOD |
|---|---|---|---|
| 安装入口 | `specify init`（官方也给出持久安装与一次性运行方式） | `npm install -g @fission-ai/openspec@latest` → `openspec init` | `npx bmad-method install` |
| CLI 命令面（摘录） | `init`；integration 的 install/status/upgrade/uninstall/switch；extension/preset 等 | `init/update/doctor/context/list/show/validate/archive/schema/config` 等，明显不只是安装器 | 以 `install` 为统一入口，通过 action/channel/pin 参数处理首装与更新 |
| 确定性职责 | 生成共享模板和 agent integration；manifest/hash 感知安装、状态、升级与卸载 | 初始化项目、重新生成 tool 指令文件，同时承担结构校验和若干工作流生命周期命令 | 模块化安装、复用现有设置更新、渠道选择与版本门控 |
| 项目语义 | 规格/计划等用户产物不由 integration upgrade 改写；生成式工作主要由 agent 命令承载 | agent 命令/skills 承担生成式工作，但 CLI 也明确拥有 validate/archive 等确定性生命周期能力 | agent/workflow 承担方法语义，安装器负责落盘与版本选择 |
| 升级机制 | manifest 跟踪 managed 文件；本地改写会阻止 upgrade，除非 `--force`；规格、计划和源码不在该升级路径内 | `update` 按当前配置重新生成受管 skills/commands，并包含遗留目录迁移与清理逻辑 | Quick Update 复用设置；stable 的 patch/minor 可自动，major 默认拒绝，非交互接受需显式 pin |
| 三方合并 | 所核对官方页描述 hash/阻断/force，未记录三方合并 | 所核对 CLI 文档与 update 源码描述重新生成/迁移，未记录三方合并 | 所核对安装文档描述更新与版本门控，未记录三方合并 |
| 卸载 | 有 `integration uninstall`：删除 hash 未变文件、保留已改文件，`--force` 可覆盖保护 | 官方 CLI 摘要未列项目卸载命令；不能据此断言全项目没有任何清理路径 | 所核对安装文档未列独立卸载命令；不能据此断言其他位置不存在 |

补充观察：AGENTS.md / SKILL.md 这类文件协议不要求项目运行时依赖专用 CLI，但大规模分发仍常借助平台 marketplace、安装命令或复制脚手架。这里能证明的是“分发入口有价值”，不能推出“语义必须进 CLI”。

## 2. 可迁移的共同部分

1. CLI 对“第一次落盘”和“以后怎么更新”有明确价值；
2. 确定性受管文件应有 manifest/hash 或等价所有权边界；
3. 用户产物与项目事实不应被机械升级猜测或覆盖；
4. 发生本地改写时，停止、报告、显式 force 是已验证的安全模式；
5. 生成式语义主要由 agent/Skill 承担，但竞品 CLI 仍可能包含校验和生命周期命令，因此不能写成“语义 100% 不在 CLI”。

三家并不存在统一的命令面，也不存在“都没有卸载”的共同事实。BuildBeat 是否实现某项能力，应回到自身失败模式、替代路径和维护成本，而不是按竞品数量投票。

## 3. 对 BuildBeat 的启示

1. **文件所有权设计可直接借鉴 Spec Kit**：`replace-if-unmodified` 对应 hash 跟踪的 managed 文件；`project-owned` 对应升级路径明确排除的规格、计划与源码。
2. **不做三方合并是成本取舍，不是市场定律**：官方对照页没有提供三方合并先例；BuildBeat 可先输出冲突报告，把语义合并交给现场 AI 会话，但必须通过自己的回归和试点验证效果。
3. **SKILL-first 方向成立**：OpenSpec 和 Spec Kit 都会生成面向 agent 的 skills/commands，说明语义入口与确定性 CLI 可以分层。
4. **不把 bus-check 复刻进 CLI**：这是 BuildBeat 已有无安装脚本层带来的产品取舍；OpenSpec 选择 CLI validate 不能反向证明它“没有脚本层”，也无需被复制。
5. **`init` 真写是最短分发闭环**：三家的开始路径都由安装/初始化命令承接。BuildBeat 仍需用自己的新项目试点证明 README 一条命令能完成从落盘到 AI 渲染的全链路。

## 4. 决策记录（2026-08-24）

- 推翻同日早先的"CLI 全冻结"，修订为**选择性解冻**：
  - **Wave 1**：`init`/`adopt` 真写入（哑脚手架：拷模板 + 填确定项，剩余占位符显式留给 AI 会话渲染；写 manifest 基线）；
  - **Wave 2**：`upgrade` 机械升级（hash 相等→替换；改过→停下报告 + `--force`；project-owned 永不碰；semver 门控）；
  - `three-way-only` 策略降级为“冲突报告 + AI 会话语义合并”，三方合并引擎从契约删除；
  - **继续冻结**：BuildBeat 项目 uninstall 引擎（手册替代）、`gate/adr/standards` 等 CLI 命令、CLI 复刻 bus 级检查、中断恢复 journal（以“写前要求 git 工作区干净”替代，git 即回滚安全网）。Spec Kit 有 integration uninstall，不改变本产品的阶段性取舍。
- 分发补强：README 第一屏一条命令；打包 Claude plugin marketplace plugin。

## 5. 官方来源（核对于 2026-08-24）

- Spec Kit：[Upgrade Guide](https://github.com/github/spec-kit/blob/main/docs/upgrade.md)、[Integration reference](https://github.com/github/spec-kit/blob/main/docs/reference/integrations.md)、[Core command reference](https://github.com/github/spec-kit/blob/main/docs/reference/core.md)
- OpenSpec：[CLI reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md)、[`src/core/update.ts`](https://github.com/Fission-AI/OpenSpec/blob/main/src/core/update.ts)
- BMAD-METHOD：[How to Install BMad](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/install-bmad.md)
