# ADR-0001: 账本采用本地优先 SQLite

- Status: Accepted
- Date: 2026-06-13
- Superseded by: n/a

## Context

一期需要单用户快速记账、离线可用和低运维成本；当前没有多人实时协作或跨区域数据库需求。

## Decision

API 使用 SQLite 作为一期账本存储，金额以整数分保存；数据库文件仅由 API 服务拥有，Web 不直连。

## Consequences

部署和备份简单，但多实例写入能力受限。若进入多人实时协作或水平扩容，必须另建 ADR，不把 SQLite 直接外推为长期通用方案。

## Alternatives considered

PostgreSQL 能支持后续多实例，但一期运维成本与真实需求不匹配；浏览器本地存储无法满足服务端备份与 API 契约。

## Related contracts / work packages / evidence

一期记账主流程工作包；`contracts/PROTOCOL.md` 金额与账目字段；`pm/archive/一期/evidence/implementation.md`。
