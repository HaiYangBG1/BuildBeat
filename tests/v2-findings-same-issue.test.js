import assert from "node:assert/strict";
import test from "node:test";

import { fingerprintFinding, sameIssue } from "../src/v2/runtime/findings.js";

const p1 = (summary) => ({ severity: "P1", summary });

test("the same fingerprint is the same issue", () => {
  assert.equal(sameIssue(p1("lock is never released"), p1("Lock is  never released")), true);
});

test("a restatement citing the same files is the same issue, line numbers aside", () => {
  const before = p1("完整 diff 包含两个允许范围外的文件: docs/guide.md:73、tests/e2e.test.mjs:293：base 1a2b3c4");
  const after = p1("完整 diff 包含本次允许范围之外的改动: docs/guide.md:80、tests/e2e.test.mjs:301：1a2b3c4..5d6e7f8");
  assert.notEqual(fingerprintFinding(before), fingerprintFinding(after));
  assert.equal(sameIssue(after, before), true);
});

test("a close restatement without file anchors is the same issue", () => {
  assert.equal(sameIssue(
    p1("root 管理者与 deploy 服务身份仍未被代码强制分离"),
    p1("root 管理者与 deploy 服务身份的所有权要求互相冲突"),
  ), true);
});

test("a different problem in the same file is not the same issue", () => {
  assert.equal(sameIssue(
    p1("src/workspace/locks.js:115-128 reclaim moves a live lock aside, so a third process can take it before restore"),
    p1("src/workspace/locks.js:126-168 treats an unreadable claim older than 10 seconds as abandoned while its writer may still run"),
  ), false);
});

test("similar wording about different files is not the same issue", () => {
  assert.equal(sameIssue(
    p1("src/api/orders.ts:40 retries generate a new idempotency key each time"),
    p1("src/api/refunds.ts:12 duration stays editable while a retry is pending"),
  ), false);
});

test("severity does not split an issue that escalated", () => {
  assert.equal(sameIssue(
    { severity: "P1", summary: "完整 diff 仍包含两个允许范围外的文件: docs/guide.md:73、tests/e2e.test.mjs:293" },
    { severity: "P0", summary: "完整 diff 包含两个允许范围外的文件: docs/guide.md:73、tests/e2e.test.mjs:293" },
  ), true);
});

test("short summaries match on the fingerprint only", () => {
  assert.equal(sameIssue(p1("issue two"), p1("issue three")), false);
  assert.equal(sameIssue(p1("issue two"), p1("issue two")), true);
});

test("a short summary at moved line numbers or a higher severity is the same issue", () => {
  assert.equal(sameIssue(p1("src/a.js:12 异常分支未释放锁"), p1("src/a.js:20 异常分支未释放锁")), true);
  assert.equal(sameIssue(p1("异常分支未释放锁"), { severity: "P0", summary: "异常分支未释放锁" }), true);
  assert.equal(sameIssue(p1("src/a.js:12 异常分支未释放锁"), p1("src/b.js:12 异常分支未释放锁")), false);
});

test("backquoted paths are anchors, so two problems in one long path stay apart", () => {
  const path = "packages/server/src/credentials/refresh-token-store.ts";
  assert.equal(sameIssue(p1(`\`${path}\` 未处理超时`), p1(`\`${path}\` 日志泄露令牌`)), false);
  assert.equal(sameIssue(p1(`\`${path}\` 刷新令牌与登出请求并发执行时会丢失令牌的过期时间`), p1(`\`${path}\` 刷新令牌与登出请求并发执行时仍会丢失令牌的过期时间`)), true);
});
