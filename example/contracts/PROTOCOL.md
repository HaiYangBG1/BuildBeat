# 简账 跨边界契约 · PROTOCOL(SSOT)

> **这是跨仓边界唯一的契约入口。** 谁改接口行为,先改这里;谁要接接口,先读这里。
> 🔴 协议变更不照单全收——独立核查后再信,并在 §3 登记一行。本文件不含任何凭据明文。

**契约快照对应版本:`v0.2.0`**(2026-06-20 上线)
> 🔴 线上实况唯一查询口 = `bash scripts/bus-check.sh`;本行只标「本快照写就时对应的版本」。

---

## 1. 当前契约快照

### 边界:jz-web ↔ jz-api(REST,JSON)

| 端点/字段 | 行为 | 备注 |
|---|---|---|
| `POST /api/entries` | 记一笔:`{amount, category, note?, ts}` → 201 | `amount` 一律**整数分**,前端负责展示为元 |
| `GET /api/entries?month=YYYY-MM` | 当月流水,按 `ts` 倒序 | 分页二期再说 |
| `GET /api/reports/monthly?month=YYYY-MM` | `{total, byCategory:[{category,sum}]}` | **按自然月**汇总(拍板 2026-06-12);空月返回 `{total:0, byCategory:[]}`,**不 404** |
| 鉴权 | 单用户:`Authorization: Bearer <token>` | token 位置见 `ARCHITECTURE.md` §凭据 |
| 错误 | `{error:{code,message}}` + 4xx/5xx | code 枚举:`INVALID_MONTH` / `UNAUTHORIZED` |

## 2. 🔴 当前关键对齐点(开工前各域必须一致)

1. 金额单位 = **分**(整数),序列化任何环节不得出现浮点——两端各有一条测试盯这条。
2. 空月份返回空结构不 404——前端按"有数据/空数据"两态渲染,不做 404 分支。

## 3. 契约变更记录(changelog · 倒序)

| 版本 | 日期 | 变更 | 独立核查 |
|---|---|---|---|
| v0.2.0 | 2026-06-18 | 新增 `GET /api/reports/monthly`;定「空月返回空结构不 404」 | 测试域实测 `curl …?month=2026-01` → 200 + 空结构;读 `jz-web` Report 页确认无 404 分支,两端一致 |
| v0.1.0 | 2026-06-13 | 首版:entries 两端点 + Bearer 鉴权 + 金额单位分 | reviewer 只读核两端代码,字段名/类型/错误码一致 |
