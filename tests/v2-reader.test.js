// Reader test (WORK-READER-TEST): a reader with no context gets one document
// of a work and answers fixed questions. These tests use a scripted reader;
// they prove what the reader is given, what is recorded and what is checked,
// not that a real model reads well.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { READER_QUESTIONS, readerPrompt, runReaderTest } from "../src/v2/runtime/reader.js";
import { PROJECT_CONFIG, addWork, approved, cli, commit, fixture, git, jsonl, worker, write, yaml } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

const WORK = "WORK-A";
const WORK_ANSWERS = ["A feature file.", ["src/"], ["docs"], "test -f src/feature.txt", [], "the scope grows", ["who uses it"]];
const RESULT_ANSWERS = (sha) => [`Shipped in ${sha.slice(0, 7)}.`, ["one format"], ["nothing"], ["docs/notes.md"], []];
const report = (answers) => JSON.stringify({ answers: Object.fromEntries(answers.map((answer, index) => [String(index + 1), answer])) });
// A reader written in the test: returns the answers and keeps what it was given.
function reader(answers, seen = {}) {
  return worker((args) => {
    Object.assign(seen, { cwd: args.workspacePath, input: args.input, prompt: readFileSync(args.promptPath, "utf8") });
    return { stdout: typeof answers === "string" ? answers : report(answers) };
  }, "test:reader");
}
const rows = (root) => jsonl(root, WORK, "reader-tests.jsonl");
const call = (root, args) => cli(args, { cwd: root });

// A reader script for the CLI: it leaves a probe of where it ran and what it
// saw there, then answers from the file named by READER_ANSWERS.
const SCRIPT = [
  "#!/bin/sh",
  'if [ -n "${READER_PROBE:-}" ]; then { echo "$1"; pwd; ls -A | grep -v "^\\.git$" || true; echo "--"; printf "%s" "$BUILDBEAT_INPUT"; } > "$READER_PROBE"; fi',
  'cat "$READER_ANSWERS" > "$BUILDBEAT_OUTPUT"',
  'exit "${READER_EXIT:-0}"',
  "",
].join("\n");
function scripted({ answers = report(WORK_ANSWERS), own = false, exit = 0, direct = false } = {}) {
  const side = tempDir("bb-reader-side-");
  const env = ["    env:", `      READER_ANSWERS: ${join(side, "answers.json")}`, `      READER_PROBE: ${join(side, "probe.txt")}`, `      READER_EXIT: "${exit}"`];
  // The script is named relative to the repository, as the command itself
  // or as an argument, and one argument comes from envelope.vars.
  const command = direct ? ["    command: tools/reader.sh", "    args:", "      - \"{vars.component}\""] : ["    command: sh", "    args:", "      - tools/reader.sh", "      - \"{vars.component}\""];
  const envelope = yaml(["envelope:", "  prompts: envelope/prompts", "  vars:", "    component: ledger"]);
  const config = own
    ? PROJECT_CONFIG + yaml(["  reader:", ...command, ...env]) + envelope
    : envelope + yaml(["workers:", "  verifier:", "    command: bash", "    args:", "      - -lc", "      - test -f src/feature.txt", "  reviewer:", ...command, ...env]);
  const { root } = fixture({ prefix: "bb-reader-", projectConfig: config, accept: false });
  write(side, "answers.json", answers);
  write(root, "tools/reader.sh", SCRIPT);
  chmodSync(join(root, "tools", "reader.sh"), 0o755);
  commit(root, "the reader script and its prompt", { "delivery/envelope/prompts/reader.md": "PROMPT for {{component}}\n" });
  return { root, side };
}

test("the prompt is the fixed questions and the document, and nothing about the repository", () => {
  const prompt = readerPrompt({ name: "work.md", text: "# The title\n\nBODY-MARK\n" }, "INSTRUCTIONS-MARK");
  assert.match(prompt, /^INSTRUCTIONS-MARK\n/);
  READER_QUESTIONS["work.md"].forEach((question, index) => assert.ok(prompt.includes(`${index + 1}. ${question}`)));
  assert.ok(prompt.endsWith("# The title\n\nBODY-MARK\n"));
  assert.equal(READER_QUESTIONS["work.md"].length, 7);
  assert.equal(READER_QUESTIONS["result.md"].length, 5);
});

test("the reader runs in an empty directory outside the repository and its answers are recorded with the document's digest and size", () => {
  const { root } = fixture({ prefix: "bb-reader-" });
  const seen = {};
  const row = runReaderTest({ repoRoot: root, workId: WORK, adapter: reader(WORK_ANSWERS, seen), now: () => "2026-11-11T00:00:00.000Z" });
  assert.equal(realpathSync(root).startsWith(seen.cwd) || seen.cwd.startsWith(realpathSync(root)) || seen.cwd.startsWith(root), false);
  assert.equal(existsSync(seen.cwd), false, "the directory is removed afterwards");
  assert.deepEqual(seen.input, { step: "reader", workId: WORK, doc: "work.md" });
  assert.ok(seen.prompt.includes("A feature file."), "the document reaches the reader through the prompt");
  assert.doesNotMatch(seen.prompt, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const text = readFileSync(join(root, "delivery", "work", WORK, "work.md"), "utf8");
  assert.deepEqual(rows(root), [row]);
  assert.equal(row.doc, "work.md");
  assert.equal(row.bytes, Buffer.byteLength(text));
  assert.match(row.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(row.reader, "test:reader");
  assert.deepEqual(row.answers, WORK_ANSWERS);
  // Nothing to compare the paths with: no commit of the work, no allowedPaths.
  assert.deepEqual(row.checks, []);
});

test("the paths a reader of work.md names are checked against allowedPaths, then against what the work's commits changed", () => {
  const { root } = fixture({ prefix: "bb-reader-" });
  const test1 = (answers, allowedPaths) => runReaderTest({ repoRoot: root, workId: WORK, adapter: reader(answers), allowedPaths }).checks;
  const named = (paths) => WORK_ANSWERS.map((answer, index) => (index === 1 ? paths : answer));
  assert.deepEqual(test1(named(["src/feature.txt"]), ["src"]), [{ question: 2, against: "allowedPaths", ok: true, missed: [] }]);
  assert.deepEqual(test1(named(["src/feature.txt", "docs/guide.md"]), ["src"]), [{ question: 2, against: "allowedPaths", ok: false, missed: ["docs/guide.md"] }]);
  // A bare directory name in a list is a path; a word in a sentence is not.
  assert.deepEqual(test1(named(["src"]), ["src"]), [{ question: 2, against: "allowedPaths", ok: true, missed: [] }]);
  assert.deepEqual(test1(named("only `src` and what tests need"), ["src"]), [{ question: 2, against: "allowedPaths", ok: true, missed: [] }]);
  assert.deepEqual(test1(named(["文档/说明.md", "src/my file.js"]), ["src", "文档"]), [{ question: 2, against: "allowedPaths", ok: true, missed: [] }]);
  assert.deepEqual(test1(named(["src/ 下的导出代码", "docs/guide.md @ abc1234 — the guide"]), ["src"])[0].missed, ["docs/guide.md"]);
  // An answer that names no path is not confirmed.
  assert.equal(test1(named("everything it needs"), ["src"])[0].ok, false);

  commit(root, `add the feature\n\nWork: ${WORK}`, { "src/feature.txt": "hello\n", "docs/guide.md": "guide\n" });
  const against = "the paths the work's commits changed";
  assert.deepEqual(test1(named(["src/", "docs/guide.md"]), ["src"]), [{ question: 2, against, ok: true, missed: [] }]);
  assert.deepEqual(test1(named(["`src/feature.txt`"]), null), [{ question: 2, against, ok: false, missed: ["docs/guide.md"] }]);

  // A merge counts for what it brought in from the side branch.
  git(root, ["checkout", "-q", "-b", "side"]);
  commit(root, "side work", { "lib/side.js": "side\n" });
  git(root, ["checkout", "-q", "main"]);
  git(root, ["merge", "-q", "--no-ff", "side", "-m", `merge side\n\nWork: ${WORK}`]);
  assert.deepEqual(test1(named(["src", "docs"]), null), [{ question: 2, against, ok: false, missed: ["lib/side.js"] }]);
  assert.equal(test1(named(["src", "docs", "lib"]), null)[0].ok, true);
});

test("a reader of result.md is checked on the approved commit and on the write-back lines Git confirms", () => {
  const { root } = fixture({ prefix: "bb-reader-" });
  const { sha } = approved(root, WORK);
  const noted = commit(root, "docs: notes", { "docs/notes.md": "a rule\n" });
  const merge = commit(root, "later work on main", { "README.md": "more\n" });
  write(root, `delivery/work/${WORK}/result.md`, `# ${WORK}\n\nShipped.\n\n## Written into the project\n- docs/notes.md @ ${noted.slice(0, 7)} — the rule\n- docs/missing.md @ ${noted.slice(0, 7)} — not in that commit\n`);
  const checks = (answers) => runReaderTest({ repoRoot: root, workId: WORK, adapter: reader(answers) }).checks;
  const commitCheck = (ok) => ({ question: 1, against: "the commits approved for this work", ok, missed: ok ? [] : [sha.slice(0, 7)] });
  const docsCheck = (ok) => ({ question: 4, against: "the write-back lines Git confirms", ok, missed: ok ? [] : ["docs/notes.md"] });
  assert.deepEqual(checks(RESULT_ANSWERS(sha)), [commitCheck(true), docsCheck(true)]);
  // A later commit that contains the approved one counts; an unrelated or unnamed one does not.
  assert.deepEqual(checks(RESULT_ANSWERS(merge))[0], commitCheck(true));
  const base = git(root, ["rev-list", "--max-parents=0", "HEAD"]);
  assert.deepEqual(checks(RESULT_ANSWERS(base))[0], commitCheck(false));
  // Paths with spaces or non-ASCII names are compared as they are.
  const odd = commit(root, "docs: more", { "docs/说明.md": "x\n", "docs/release notes.md": "y\n" });
  write(root, `delivery/work/${WORK}/result.md`, `# ${WORK}\n\nShipped.\n\n## Written into the project\n- docs/说明.md @ ${odd.slice(0, 7)} — x\n- \`docs/release notes.md\` @ ${odd.slice(0, 7)} — y\n`);
  const oddAnswers = (docs) => RESULT_ANSWERS(sha).map((answer, index) => (index === 3 ? docs : answer));
  assert.equal(checks(oddAnswers(["docs/说明.md", "docs/release notes.md"]))[1].ok, true);
  assert.deepEqual(checks(oddAnswers("写进了 docs/说明.md。"))[1].missed, ["docs/release notes.md"]);
  write(root, `delivery/work/${WORK}/result.md`, `# ${WORK}\n\nShipped.\n\n## Written into the project\n- docs/notes.md @ ${noted.slice(0, 7)} — the rule\n`);
  // A path that merely contains the written one is another path.
  const near = RESULT_ANSWERS(sha).map((answer, index) => (index === 3 ? ["unrelated/docs/notes.md.bak"] : answer));
  assert.deepEqual(checks(near)[1], docsCheck(false));
  const lined = RESULT_ANSWERS(sha).map((answer, index) => (index === 3 ? `docs/notes.md @ ${noted.slice(0, 7)} — the rule` : answer));
  assert.deepEqual(checks(lined)[1], docsCheck(true));
  const vague = RESULT_ANSWERS(sha).map((answer, index) => (index === 0 ? "Shipped last week." : index === 3 ? ["some documents"] : answer));
  assert.deepEqual(checks(vague), [commitCheck(false), docsCheck(false)]);
  assert.equal(rows(root).at(-1).doc, "result.md");
});

test("a work nobody reviewed and a result page without write-back lines are not checked, not wrong", () => {
  const { root } = fixture({ prefix: "bb-reader-" });
  write(root, `delivery/work/${WORK}/result.md`, `# ${WORK}\n\nShipped.\n`);
  const row = runReaderTest({ repoRoot: root, workId: WORK, adapter: reader(RESULT_ANSWERS("0000000")) });
  assert.deepEqual(row.checks, []);
  // --doc work still reads the description once a result page exists.
  assert.equal(runReaderTest({ repoRoot: root, workId: WORK, doc: "work", adapter: reader(WORK_ANSWERS) }).doc, "work.md");
});

test("tool trouble and unusable reports record nothing", () => {
  const { root } = fixture({ prefix: "bb-reader-" });
  const fails = (adapter, pattern) => assert.throws(() => runReaderTest({ repoRoot: root, workId: WORK, adapter }), pattern);
  fails(worker({ timedOut: true, exitCode: null }), /the reader did not finish \(timeout\); nothing recorded/);
  fails(worker({ exitCode: 75, stderr: "no backend\n" }), /exit 75 \(environment not ready\): no backend\); nothing recorded/);
  fails(worker({ exitCode: null, signal: "SIGKILL" }), /killed by SIGKILL/);
  fails(worker({ exitCode: null, spawnError: "spawn nope ENOENT" }), /could not start: spawn nope ENOENT/);
  fails(reader("I think it is fine."), /cannot be used \(worker envelope is not valid JSON\)/);
  fails(reader(JSON.stringify({ findings: [] })), /needs an "answers" object/);
  fails(reader(report(WORK_ANSWERS.slice(0, 6))), /answer 7 must be a list of strings/);
  fails(reader(report(WORK_ANSWERS.map((answer, index) => (index === 6 ? "nothing" : answer)))), /answer 7 must be a list of strings/);
  fails(reader(report(WORK_ANSWERS.map((answer, index) => (index === 0 ? 3 : answer)))), /answer 1 must be a string or a list of strings/);
  assert.equal(existsSync(join(root, "delivery", "work", WORK, "reader-tests.jsonl")), false);
  // A fenced report is read.
  assert.equal(runReaderTest({ repoRoot: root, workId: WORK, adapter: reader(`\`\`\`json\n${report(WORK_ANSWERS)}\n\`\`\``) }).answers.length, 7);
});

test("the CLI reads a document with the reviewer's command when no reader is configured, and status and accept follow the test", () => {
  const { root, side } = scripted();
  const none = call(root, ["accept", "--repo", ".", "--work", WORK, "--by", "owner", "--as", "human"]);
  assert.match(none.out, /^ {2}note: delivery\/work\/WORK-A\/work\.md has no reader test; buildbeat reader --repo \. --work WORK-A$/m);
  assert.doesNotMatch(call(root, ["status", "--repo", ".", "--work", WORK]).out, /reader:/);

  const read = call(root, ["reader", "--repo", ".", "--work", WORK]);
  assert.equal(read.status, 0, read.all);
  assert.match(read.out, /^reader read delivery\/work\/WORK-A\/work\.md \(0\.\d KB, sha256:[0-9a-f]{12}\)$/m);
  assert.match(read.out, /^2\. 要改哪些目录或文件？\n {3}- src\/$/m);
  assert.match(read.out, /^5\. 开工前还有哪些事要人定？\n {3}\(no answer\)$/m);
  assert.match(read.out, /^7\. 读完这份文档，还有什么是你不知道、只能猜的？\n {3}- who uses it$/m);
  assert.match(read.out, /^recorded in delivery\/work\/WORK-A\/reader-tests\.jsonl$/m);
  assert.doesNotMatch(read.all, new RegExp(realpathSync(root).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(rows(root)[0].reader, "shell:reviewer");

  // Where the script ran: an empty directory that is not in the repository;
  // its input names the work and the document, no path.
  const [component, where, ...rest] = readFileSync(join(side, "probe.txt"), "utf8").split("\n");
  assert.equal(component, "ledger", "envelope.vars reach the reader's arguments");
  assert.equal(where.startsWith(realpathSync(root)), false);
  assert.deepEqual(rest, ["--", JSON.stringify({ step: "reader", workId: WORK, doc: "work.md" })]);

  const status = call(root, ["status", "--repo", ".", "--work", WORK]);
  assert.match(status.out, /^ {2}reader: work\.md · answered 5\/6 · unanswered 1 · checked 0\/0 · 0\.\d KB$/m);
  assert.deepEqual(JSON.parse(call(root, ["status", "--repo", ".", "--work", WORK, "--json"]).out).works[0].reader.answered, 5);
  assert.doesNotMatch(call(root, ["accept", "--repo", ".", "--work", WORK, "--by", "owner", "--as", "human"]).out, /no reader test/);

  // One changed character and the test no longer speaks for the document.
  write(root, `delivery/work/${WORK}/work.md`, `${readFileSync(join(root, "delivery", "work", WORK, "work.md"), "utf8")}.\n`);
  assert.match(call(root, ["status", "--repo", ".", "--work", WORK]).out, /^ {2}reader: work\.md changed since its reader test$/m);
  assert.match(call(root, ["accept", "--repo", ".", "--work", WORK, "--by", "owner", "--as", "human"]).out, /no reader test/);
});

test("workers.reader is used when configured; a failing reader exits 1 and records nothing; other worker names stay unknown", () => {
  const own = scripted({ own: true, direct: true });
  const read = call(own.root, ["reader", "--repo", ".", "--work", WORK, "--doc", "work"]);
  assert.equal(read.status, 0, read.all);
  assert.equal(rows(own.root)[0].reader, "shell:reader");
  assert.match(call(own.root, ["check", "--repo", "."]).out, /^ {2}reader: tools\/reader\.sh \{vars\.component\}$/m);

  for (const broken of [scripted({ exit: 75 }), scripted({ answers: "not json" })]) {
    const failed = call(broken.root, ["reader", "--repo", ".", "--work", WORK]);
    assert.equal(failed.status, 1);
    assert.match(failed.err, /^error: the reader('s report cannot be used| did not finish) .*nothing recorded$/m);
    assert.equal(existsSync(join(broken.root, "delivery", "work", WORK, "reader-tests.jsonl")), false);
  }

  const { root } = fixture({ prefix: "bb-reader-", projectConfig: PROJECT_CONFIG + yaml(["  writer:", "    command: sh"]) });
  assert.match(call(root, ["reader", "--repo", ".", "--work", WORK]).err, /workers\.writer: unknown key/);
  const missing = call(root, ["reader", "--repo", ".", "--work", WORK, "--doc", "result"]);
  assert.match(missing.err, /unknown key|result\.md does not exist/);
  const { root: plain } = fixture({ prefix: "bb-reader-" });
  assert.match(call(plain, ["reader", "--repo", ".", "--work", WORK, "--doc", "result"]).err, /^error: delivery\/work\/WORK-A\/result\.md does not exist$/m);
  assert.match(call(plain, ["reader", "--repo", ".", "--work", WORK, "--doc", "notes"]).err, /^error: --doc is work or result$/m);
});
