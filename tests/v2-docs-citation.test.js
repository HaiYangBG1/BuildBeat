// The docs check's citation rule (WORK-FALSE-POSITIVES): it rejects the
// citation markers some AI tools leave in exported text, and no longer
// rejects ordinary English words that merely contain the same letters,
// which had made sessions reword correct prose twice.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const TESTS = join(import.meta.dirname);

// Runs the docs check's own pattern over each sample, in one Python call.
function flagged(samples) {
  const script = [
    "import json, sys",
    "sys.path.insert(0, sys.argv[1])",
    "import check_docs",
    "print(json.dumps([bool(check_docs.INTERNAL_CITATION.search(text)) for text in json.loads(sys.argv[2])]))",
  ].join("\n");
  return JSON.parse(execFileSync("python3", ["-I", "-c", script, TESTS, JSON.stringify(samples)], { encoding: "utf8" }));
}

test("ordinary words pass the citation check", () => {
  const words = ["recite the list", "an excited reviewer", "elicited answers", "please cite the source", "solicited", "citep"];
  assert.deepEqual(flagged(words), words.map(() => false));
});

test("exported citation markers still fail it", () => {
  const markers = [
    "see filecite here",
    "as shown citeturn0search3",
    "citeturn0file1",
    "【4:0†source】",
  ];
  assert.deepEqual(flagged(markers), markers.map(() => true));
});
