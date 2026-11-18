// The fixed flow of a review: verify, then a read-only review, then the
// person's decision on the commit. The text is what a run pins by digest in
// its first event, so "what did this run do" has an answer in the ledger.
import { createHash } from "node:crypto";

export const WORKFLOW_NAME = "software-delivery";
export const WORKFLOW_TEXT = `kind: workflow
version: 2
name: software-delivery
steps:
  - id: verify
    worker: verifier
  - id: review
    worker: reviewer
    readonly: true
  - id: wait-merge
`;
export const WORKFLOW_DIGEST = `sha256:${createHash("sha256").update(WORKFLOW_TEXT, "utf8").digest("hex")}`;

// The two steps a run executes; wait-merge is where it stops for the person.
export const REVIEW_STEPS = [
  { id: "verify", worker: "verifier", readonly: false, grade: "L2" },
  { id: "review", worker: "reviewer", readonly: true, grade: "L2" },
];

// A project that has not configured a reviewer yet (WORK-SINGLE-TOOL): the
// commit is verified, not reviewed, and the run says so by pinning this text.
export const VERIFY_ONLY_NAME = "verify-only";
export const VERIFY_ONLY_TEXT = `kind: workflow
version: 2
name: verify-only
steps:
  - id: verify
    worker: verifier
  - id: wait-merge
`;
export const VERIFY_ONLY_DIGEST = `sha256:${createHash("sha256").update(VERIFY_ONLY_TEXT, "utf8").digest("hex")}`;

// The flow a review runs: both steps when a reviewer is configured.
export function reviewFlow(hasReviewer) {
  return hasReviewer
    ? { name: WORKFLOW_NAME, digest: WORKFLOW_DIGEST, steps: REVIEW_STEPS }
    : { name: VERIFY_ONLY_NAME, digest: VERIFY_ONLY_DIGEST, steps: REVIEW_STEPS.slice(0, 1) };
}
