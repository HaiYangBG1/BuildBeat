# DESIGN.md — <项目名> UI / 视觉 / 交互规范

> **Optional**: 仅有 UI、视觉或交互交付的项目按需创建；缺失时 BuildBeat 直接跳过，不作为告警或错误。
> **AI write boundary**: 默认只读；普通页面实现不得顺手重写设计系统，只有用户明确批准设计语言变化或项目首次确认本规范时才可修改。
> **Status**: Draft

## Principles

<设计原则>

## Tokens

<排版 / 色彩 / 间距 token 来源>

## Components

<核心组件与复用边界>

## Interaction Patterns

- `DESIGN-MUST-001`: 关键操作提供即时、明确且可访问的反馈；不得只靠颜色区分状态。
- `DESIGN-MUST-002`: 上线界面不得出现调试信息、实现说明、mock 标记或写给开发者的元注释。

## States

- `DESIGN-MUST-003`: 每个可见流程必须处理 loading、empty、error、disabled 和适用的移动端状态。

## Accessibility

- `DESIGN-MUST-004`: 键盘路径、焦点、语义标签、对比度和减弱动态效果必须进入真渲染走查。

## Project-specific exceptions

<项目特有例外>

Gate2 与终签以真渲染可点结果为准；静态稿或规范数值不能替代实际走查。
