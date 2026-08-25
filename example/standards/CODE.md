# CODE.md — 简账代码与安全规范

> **Optional**: 本文件由项目拥有；缺失时 BuildBeat 直接跳过，不作为告警或错误。
> **AI write boundary**: 默认只读；普通需求、修构建或装依赖不得顺手改规范。
> **Status**: Confirmed

## Rules

- `CODE-MUST-001`: Secret、真实账本、身份数据和生产配置值不得进入 Git、日志、测试夹具或证据。
- `CODE-MUST-002`: API 输入先做 schema 校验；账目写入失败必须回滚，不返回伪成功。
- `CODE-MUST-003`: 前后端共享字段变化先同步 `contracts/PROTOCOL.md`，再分别实现。
- `CODE-MUST-004`: 新依赖必须提交 lockfile，并通过许可证与安全检查。
- `CODE-SHOULD-001`: 金额在 API 与存储层使用整数分，界面边界才格式化为元。
- `CODE-MAY-001`: 局部重构可随工作包完成，但不得趁机更换框架或持久化方案。

## 项目禁止事项

不得用浮点数持久化金额；不得在前端日志输出完整账目内容。
