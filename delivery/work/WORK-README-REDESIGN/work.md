# README 重做：好看、好读，开头讲名字的由来

## 目标

现在的 README（中英）只有几段文字和两段命令：第一眼看不出 BuildBeat 是什么、凭什么值得用，也不好读。所有者 2026-10-07 要求单独开一项工作重做。

做成一份第一屏就能看懂的 README：开头讲名字的由来（所有者的解读：每一步是一个音符，Agent 按节拍把它们演奏出来，演奏过的乐谱——上下文、决定和证据——留在 Git 里随时翻阅），配主视觉和交付循环示意图，按读者真正的问题组织：这是什么、凭什么信、怎么开始、跑起来什么样、边界在哪。

## 待所有者确认（接受本说明即确认）

| 项 | 提议 |
|---|---|
| 名字的由来 | 标题与标语之后的第一段，中英各一段 |
| 主视觉 | Codex image2 生成的无文字插画：音符沿五线谱前进、尾端收成一叠存档的乐谱；宽幅、自带底色，浅色和深色页面都能看 |
| 示意图 | SVG 画的交付循环（work.md → build → verify → review ⇄ fix → 合并决定，下方是 Git 里的记录），浅色、深色各一版；README 引用导出的 PNG（npm 页面也能显示） |
| 徽章 | npm 版本、许可证、CI 状态 |
| 结构 | 名字由来 → 一句话是什么 → 一眼看懂（循环图）→ 三个承诺（表格）→ 五分钟开始 → 跑起来是什么样（真实的 status 输出片段）→ 记录与接续 → 能力边界 → Claude Code 插件 → 继续阅读；中英结构一致 |
| 图片位置 | `docs/assets/readme/`，不进 npm 包；README 以 GitHub 上 main 分支的绝对地址引用，合入后 GitHub 与 npm 页面都能显示 |

## 范围

包含：README.md、README.en.md、`docs/assets/readme/`（插画、SVG 源文件与导出的 PNG）、文档检查对 README 图片的守卫、CHANGELOG `Unreleased`。

不包含：产品行为与其他文档、GitHub About（本日已更新）、发布。

## 验收

- `verify.sh` 全过：Node 回归、文档检查（含中英结构与命令块一致、必需入口链接、边界措辞）、Bash 信封、Claude 插件、安装后首跑、本 Work 范围内 `git diff --check`。
- README 引用的每张图都在 `docs/assets/readme/` 里存在、有 alt 文字、单张不超过 600 KB；文档检查守住这三点。README 里描述的每项能力、命令与输出片段都与当前运行时一致。
- 截图证据（run 配置 `requireScreenshot: true`）：verify 用 GitHub 的 markdown 渲染接口渲染中英 README，以无头 Chrome 截浅色与深色的桌面宽度、以及手机宽度的整页 PNG；合并决定看图。
- 独立只读审查无未裁决的 P0/P1。

## 实施计划

1. 用 Codex image2 生成主视觉，挑选、裁剪、压缩。
2. 画交付循环 SVG（浅/深），用无头 Chrome 导出 2 倍 PNG。
3. 重写中英 README。
4. 文档检查加 README 图片守卫；verify 加渲染与截图。
5. 用内置浏览器自查浅色、深色、窄屏；CHANGELOG。

## 止损

范围变化需要新的决定。审查轮数上限 6 轮（run-config `budgets.reviewRoundsPerWork`）。
