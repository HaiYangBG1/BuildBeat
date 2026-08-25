# DESIGN.md — 简账 UI / 视觉 / 交互规范

> **Optional**: 仅有 UI、视觉或交互交付的项目按需创建；缺失时 BuildBeat 直接跳过，不作为告警或错误。
> **AI write boundary**: 默认只读；普通页面实现不得顺手重写设计系统。
> **Status**: Confirmed

## Principles

清晰、克制、账目优先；不用装饰性渐变掩盖信息层级。

## Tokens

字体、颜色、间距与圆角统一来自 jz-web 的 CSS variables；页面不得自建平行 token。

## Components

金额输入、账目行、月份选择器和空态组件优先复用；差异通过 props 或明确变体表达。

## Interaction Patterns

- `DESIGN-MUST-001`: 新增账目在 100ms 内给出按压或 loading 反馈，保存结果提供可访问确认。
- `DESIGN-MUST-002`: 上线界面不得出现调试信息、实现说明、mock 标记或开发者元注释。

## States

- `DESIGN-MUST-003`: 账目列表和报表必须覆盖 loading、empty、error、disabled 与移动端状态。

## Accessibility

- `DESIGN-MUST-004`: 表单标签、键盘路径、焦点、图表替代文本和颜色对比进入真渲染走查。

## Project-specific exceptions

月度报表移动端使用单列柱状图；不复用桌面双列布局。
