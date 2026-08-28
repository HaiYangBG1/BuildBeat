# M4 外部试点 2：chickAI Bug 看板积压批处理（RUN-CHICK-0037 / 0018）

> 日期：2026-08-28
> 项目：`AI底座/chickAI/llm-playground-pro`（Next.js 生产应用，基线 `9d571b3`）
> 任务来源：项目所有者点名"异常看板积压了很多 bug，可以去处理一下"。积压读取自钉钉 AI 表格（chickAI base / Bug看板表，feedback 同步目标）：39 条中 **13 未修复 + 2 待定**（P1×3 / P2×4 / P3×8）
> 结论上限：本地候选停在合并决定；不 merge、不 push、不发布；未回写钉钉看板状态。

## 1. 本批交付（2 个 Run，全部由 codex Worker 经 Shell Adapter 驱动）

### RUN-CHICK-0037（BUG-测试-0037，P3：CSV 下载文件名未按生成标题）

**这一单完整走出了 Build–Verify–Fix–Review 自动闭环，review 环真实咬合：**

1. builder（codex）产出候选 `108553f`（抽 `lib/download-filename.ts` 纯函数 + 单测 + CHANGELOG）；verify（`npm ci` + type-check + playwright unit）一轮绿；
2. **fresh-context 只读 reviewer 阻断**：P1（命名口径未真正与 .md 下载一致、回退语义漂移）+ P2（既有 E2E 断言 `data-*.csv` 必挂——verify 只跑 unit 项目漏掉的，reviewer 抓到了）；
3. `findings-blocking` 路由 fix 步 → 配置 codex fixer（prompt 附最新 findings JSON）→ 修复为两处下载**共用同一派生函数**、更新 E2E 断言；
4. verify 二轮绿 → review 二轮零 findings → 停在合并决定。candidate `b866d5c`（5 文件）。

### RUN-CHICK-0018（BUG-测试-0018，P3：选角色后输入框仍显示「默认助手」）

一轮全绿。builder 给出的根因判断质量很高：① `Composer.currentName` 靠 `systemPrompt` 文本反查名称、未保存所选专家元数据（同正文/广场专家场景显示错误）；② `newConversation()` 复用空对话时提前返回、跳过默认专家预选。修复在传递链真实断点（`lib/store.ts` 保存元数据 + `lib/role-label.ts` 纯函数 + 单测 57 行）。candidate `fa48729`（7 文件）。review 零 findings。

## 2. 运行时事实

- metrics（本仓）：runs 2，自动到达 `WAITING_HUMAN` 100%，证据完整率 100%（9/9 步），fix 轮次分布 {0×1, 1×1}，stale 0、超预算 0；
- worktree 隔离 + `npm ci` 仓内自举（主检出的残缺 node_modules 未被触碰）；allowedPaths（components/lib/tests/types/CHANGELOG.md）无越界；env 白名单；
- 中途一次 attended handoff（fix 无 adapter）由受托会话批准 `enter-fix`（`D-RUN-CHICK-0037-1`，by claude-delegated，落账可查）后配置 fixer 恢复——攻防记录：**verify 只跑 unit 项目的盲区被 reviewer 补上**，后续批次可考虑把受影响 E2E spec 列入 verify。

## 3. 积压分诊（余下 13 条）

| 组 | 条目 | 处置建议 |
|---|---|---|
| P1×3（0006 生成中断/Key 权限、0029 上传报登录失效、0034 生成超时） | 涉及模型网关/登录态/生产配置，需生产侧排查与授权 | 不适合无授权自动修；建议单独立项（可先只读盘点日志） |
| P2×2 未修复（0033 切换模版重复展示、0035 复核未真正调用模型） | 前端/调用链逻辑，可自动化 | 下一批 v2 Run 候选 |
| P2×2 待定（0012 听写无失败提示、0026 我的模板边界） | 产品语义待定 | 需所有者先定语义再修 |
| P3×6（0005 下载入口格式、0017 loading 提示、0030 数字居中、0032 hover 抖动、0038 模板重复校验、0039 技能错误展示） | 小改动，部分含 UI（0030/0032 适合截图门） | 可按批继续 |

## 4. 待项目所有者

inbox 两单终态决定：`RUN-CHICK-0037`（candidate `b866d5c`）与 `RUN-CHICK-0018`（candidate `fa48729`）。批准后 merge、发布与钉钉看板状态回写仍是人工/另行授权动作。

## 5. 对 M4 的意义

外部试点项目数达到 **2（ruoyi-ai + chickAI）**，D6 原文口径满足；六退出指标在两项目上同向达标（试点 Run 自动到达率 4/4）。M4 就此关闭。
