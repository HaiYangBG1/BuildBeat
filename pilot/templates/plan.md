# Plan: <对应 intent 标题>

- 对应 intent：intent.md（<日期>）
- 状态：Draft ｜ 人工批准后改为 **Approved**；与 intent、验收 oracle、`protected-paths.txt` 一起提交，`loop.sh` 会再次显示 plan digest 让你确认

## 修改范围（文件清单）

- `<path/to/file>`（新增 / 修改）

## 实现顺序

1. <...>
2. <...>

## 契约 / 数据变化

<无，或列出接口 / schema 变化>

## 风险

<最可能坏在哪一步>

## 验证方法

- 回归命令：`<VERIFY_CMD；确认既有能力未退化>`
- 验收命令：`<ACCEPT_CMD；必须在基线失败、实现后通过>`
- 受保护 oracle：`<写入 protected-paths.txt 的测试/脚本路径；Builder/Fixer 不得修改>`
- 断言：<两条命令分别证明什么>

## 回滚方式

<如何撤销；专用 branch/worktree 只提供隔离，未提交修改不会因切分支自动消失>
