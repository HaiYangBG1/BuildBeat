// Merges the per-area reviewer answers into one envelope. A missing or
// malformed answer fails the merge (exit 1), which review.sh reports as an
// infrastructure failure instead of a clean review.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [scratch, ...areas] = process.argv.slice(2);
const SEVERITY = /^P[0-3]$/;

function parse(text, area) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    throw new Error(`${area}: answer is not JSON`);
  }
}

const findings = [];
for (const area of areas) {
  const answer = parse(readFileSync(join(scratch, `${area}.out`), "utf8"), area);
  if (answer?.status !== "succeeded" || !Array.isArray(answer.findings)) {
    throw new Error(`${area}: answer is not a succeeded envelope`);
  }
  for (const finding of answer.findings) {
    const summary = typeof finding?.summary === "string" ? finding.summary.trim() : "";
    if (!SEVERITY.test(finding?.severity ?? "") || summary === "") {
      throw new Error(`${area}: each finding needs severity P0-P3 and a summary`);
    }
    findings.push({ severity: finding.severity, summary: `[${area}] ${summary}` });
  }
}
findings.sort((a, b) => a.severity.localeCompare(b.severity));
process.stdout.write(`${JSON.stringify({ status: "succeeded", findings })}\n`);
