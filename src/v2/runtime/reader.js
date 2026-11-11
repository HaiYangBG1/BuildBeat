// Reader test (WORK-READER-TEST): a reader with no context gets one document
// of a work, work.md or result.md, and nothing else, and answers a fixed set
// of questions. What it read out, what it could not tell, and the answers
// that Git and the records can confirm go into reader-tests.jsonl, bound to
// the document's digest and size. Every other check asks whether a record
// was written correctly; this one asks whether it can be read.
//
// Not a run: nothing is verified or approved, no ledger is written. The
// reader runs in a new, empty Git repository outside the project and the document reaches it through
// the prompt, so what it answers comes from the document. That is not a
// sandbox: the tool can still read whatever its host lets it.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { checkPromotions, currentRef, parsePromotions } from "./closeout.js";
import { parseEnvelope } from "./orchestrator.js";
import { codeCommitsOf } from "./work-commits.js";

// The questions are fixed so results compare across works and projects. The
// last one of each set collects what the reader could not tell.
export const READER_QUESTIONS = {
  "work.md": [
    "做完后别人能看到什么？一句话。",
    "要改哪些目录或文件？",
    "哪些东西明确不动？",
    "用什么命令或观察判断做完了？",
    "开工前还有哪些事要人定？",
    "遇到什么情况必须停下问人？",
    "读完这份文档，还有什么是你不知道、只能猜的？",
  ],
  "result.md": [
    "做成了什么？在哪个提交或版本？",
    "定了哪些以后要遵守的事？",
    "剩下什么？转去了哪里？",
    "写进了项目哪些文档？",
    "读完这份文档，还有什么是你不知道、只能猜的？",
  ],
};

const DEFAULT_PROMPT = [
  "你是一位读者，对这个项目一无所知。下面是一份文档的全文，你只能看到它。",
  "不要读别的文件，不要查代码，不要猜：文档里没写的，就写进最后一个问题的答案里。",
].join("\n");

const digestOf = (text) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
const recordsPath = (repoRoot, workId) => join(repoRoot, "delivery", "work", workId, "reader-tests.jsonl");
const git = (repoRoot, args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

// Which document of the work a test reads when none is named: the result
// page once there is one, the description before that.
export function readerDoc(repoRoot, workId, doc = null) {
  const dir = join(repoRoot, "delivery", "work", workId);
  const name = doc ? `${doc}.md` : existsSync(join(dir, "result.md")) ? "result.md" : "work.md";
  if (!READER_QUESTIONS[name]) {
    throw new Error("--doc is work or result");
  }
  if (!existsSync(join(dir, name))) {
    throw new Error(`delivery/work/${workId}/${name} does not exist`);
  }
  const text = readFileSync(join(dir, name), "utf8");
  return { name, text, digest: digestOf(text), bytes: Buffer.byteLength(text) };
}

export function readerPrompt(doc, instructions = null) {
  const questions = READER_QUESTIONS[doc.name];
  return [
    (instructions ?? DEFAULT_PROMPT).trim(),
    "",
    "回答下面的问题。每个答案是一段短文字或一个字符串列表；最后一个问题的答案必须是列表，没有就给空列表。",
    ...(doc.name === "work.md" ? ["第 2 问的答案是路径列表：一项只写一个目录或文件的路径，不加任何说明。"] : []),
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    "",
    "最后只输出一个 JSON 对象，不要别的文字（可以裹一层 ```json 代码栏），键是问题编号：",
    `{"answers": {${questions.map((_, index) => `"${index + 1}": ${index === questions.length - 1 ? "[]" : '"…"'}`).join(", ")}}}`,
    "",
    `下面是文档 ${doc.name} 的全文：`,
    "",
    doc.text,
  ].join("\n");
}

const filled = (answer) => (Array.isArray(answer) ? answer.length > 0 : answer.trim() !== "");
const asText = (answer) => (Array.isArray(answer) ? answer.join("\n") : answer);

// The reader's report, or the reason it cannot be used.
export function parseAnswers(raw, docName) {
  const { envelope, error } = parseEnvelope(raw);
  const count = READER_QUESTIONS[docName].length;
  if (error || !envelope) {
    return { error: error ?? "the reader wrote no answers" };
  }
  const given = envelope.answers;
  if (!given || typeof given !== "object" || Array.isArray(given)) {
    return { error: 'the reader\'s report needs an "answers" object keyed by question number' };
  }
  const answers = [];
  for (let number = 1; number <= count; number += 1) {
    const answer = given[String(number)];
    const list = Array.isArray(answer) && answer.every((item) => typeof item === "string");
    if (number === count ? !list : typeof answer !== "string" && !list) {
      return { error: `answer ${number} must be ${number === count ? "a list of strings" : "a string or a list of strings"}` };
    }
    answers.push(answer);
  }
  return { answers };
}

// Paths the work's commits changed outside its own folder, or null when it
// has no code commit on the current branch yet.
function changedPaths(repoRoot, workId) {
  const commits = codeCommitsOf(repoRoot, currentRef(repoRoot), [workId]).get(workId) ?? [];
  if (commits.length === 0) return null;
  const own = `delivery/work/${workId}/`;
  const paths = new Set();
  for (const { commit } of commits) {
    // Against the first parent, so a merge counts for what it brought in.
    const parent = git(repoRoot, ["rev-list", "--parents", "-n", "1", commit]).trim().split(" ")[1];
    const listed = parent
      ? git(repoRoot, ["diff", "--no-renames", "--name-only", "-z", parent, commit])
      : git(repoRoot, ["show", "--no-renames", "--format=", "--name-only", "-z", commit]);
    for (const path of listed.split("\0")) {
      if (path && !path.startsWith(own)) paths.add(path);
    }
  }
  return [...paths].sort();
}

// The commits a person approved for this work, from its decisions.
function approvedCommits(repoRoot, workId) {
  const path = join(repoRoot, "delivery", "work", workId, "decisions.jsonl");
  if (!existsSync(path)) return [];
  const commits = [];
  for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      if (row.transition === "enter-wait-merge" && row.decision === "approved" && !row.adopted && row.subject?.candidate) {
        commits.push(row.subject.candidate);
      }
    } catch {
      // A line that is not JSON names no commit.
    }
  }
  return commits;
}

// Whether the text names exactly this path, not a longer one around it.
// For result.md, whose readers copy whole write-back lines: the paths come
// from Git and are looked for in what the reader wrote.
function names(text, path) {
  const part = "\\p{L}\\p{N}_@*-";
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![${part}./])${escaped}(?![${part}/])(?!\\.[\\p{L}\\p{N}])`, "u").test(text);
}
// The reader of work.md is asked for one path per item and nothing else,
// so each item is a path as it stands: nothing is parsed out of prose, and
// an item that carries prose is a path nothing lies under.
// One spelling for a path a reader wrote: no backticks, no leading ./, no
// trailing slash or glob.
const plain = (path) => path.trim().replace(/^`|`$/g, "").replace(/^(?:\.\/)+/, "").replace(/\/\*{0,2}$/, "");
const pathItems = (answer) => (Array.isArray(answer) ? answer : [answer]).filter((item) => item.trim() !== "").map(plain);
const under = (path, area) => path === area || path.startsWith(`${area}/`);

// The answers something other than the document can confirm. A check with
// nothing to compare against is left out: it is not checked, not wrong.
export function checkAnswers({ repoRoot, workId, doc, answers, allowedPaths = null }) {
  const checks = [];
  if (doc.name === "work.md") {
    const named = pathItems(answers[1]);
    const changed = changedPaths(repoRoot, workId);
    if (changed) {
      // Every file the work really changed is one the reader named, or lies
      // in a directory it named.
      const missed = changed.filter((path) => !named.some((area) => under(path, area)));
      checks.push({ question: 2, against: "the paths the work's commits changed", ok: missed.length === 0, missed, outside: [] });
    } else if (allowedPaths) {
      // No commit yet: everything the reader would change must be in scope.
      // The scope as a review reads it: each entry a path or a directory,
      // with or without a trailing slash, plus the work's own folder.
      const areas = [...allowedPaths.map((area) => String(area).replace(/\/$/, "")), `delivery/work/${workId}`];
      const outside = named.filter((path) => !areas.some((area) => under(path, area)));
      checks.push({ question: 2, against: "allowedPaths", ok: named.length > 0 && outside.length === 0, missed: [], outside });
    }
    return checks;
  }
  const approved = approvedCommits(repoRoot, workId);
  if (approved.length > 0) {
    // The answer names an approved commit, or a commit that contains one
    // (the merge that brought it in).
    const tokens = asText(answers[0]).match(/\b[0-9a-f]{7,40}\b/g) ?? [];
    const ok = tokens.some((token) =>
      approved.some((commit) => {
        if (commit.startsWith(token)) return true;
        try {
          git(repoRoot, ["merge-base", "--is-ancestor", commit, `${token}^{commit}`]);
          return true;
        } catch {
          return false;
        }
      }),
    );
    checks.push({ question: 1, against: "the commits approved for this work", ok, missed: ok ? [] : approved.map((commit) => commit.slice(0, 7)), outside: [] });
  }
  const written = checkPromotions(repoRoot, workId, parsePromotions(doc.text)).filter((item) => item.ok).map((item) => item.path);
  if (written.length > 0) {
    const text = asText(answers[3]);
    const missed = [...new Set(written)].filter((path) => !names(text, path));
    checks.push({ question: 4, against: "the write-back lines Git confirms", ok: missed.length === 0, missed, outside: [] });
  }
  return checks;
}

// Runs the reader on one document and records the result. Tool trouble
// (timeout, crash, exit 75, no usable report) throws and records nothing.
export function runReaderTest({ repoRoot, workId, doc: docName = null, adapter, instructions = null, vars = undefined, allowedPaths = null, timeoutMs, redact = [], now = () => new Date().toISOString() }) {
  const doc = readerDoc(repoRoot, workId, docName);
  // Two new directories outside the repository: the empty one the reader
  // works in, and one for what passes between it and the runtime.
  const cwd = mkdtempSync(join(tmpdir(), "bb-reader-"));
  // An empty repository, no commit: some tools refuse to run outside one.
  execFileSync("git", ["init", "-q", cwd], { stdio: "ignore" });
  const exchange = mkdtempSync(join(tmpdir(), "bb-reader-io-"));
  let raw;
  try {
    const promptPath = join(exchange, "prompt.md");
    const outputPath = join(exchange, "answers.json");
    writeFileSync(promptPath, readerPrompt(doc, instructions), "utf8");
    const result = adapter.execute({
      step: "reader",
      worker: "reader",
      workspacePath: cwd,
      input: { step: "reader", workId, doc: doc.name },
      timeoutMs,
      outputPath,
      promptPath,
      vars,
    });
    const trouble = result.timedOut
      ? "timeout"
      : result.spawnError
        ? `could not start: ${result.spawnError}`
        : result.signal
          ? `killed by ${result.signal}`
          : result.exitCode !== 0
            ? `exit ${result.exitCode}${result.exitCode === 75 ? " (environment not ready)" : ""}`
            : null;
    if (trouble) {
      const said = (result.stderr || result.stdout).trim().split("\n").at(-1) ?? "";
      throw new Error(`the reader did not finish (${trouble}${said ? `: ${said.slice(0, 200)}` : ""}); nothing recorded`);
    }
    raw = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : result.stdout;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(exchange, { recursive: true, force: true });
  }
  for (const pattern of redact) {
    raw = raw.replace(pattern, "[REDACTED]");
  }
  const parsed = parseAnswers(raw, doc.name);
  if (parsed.error) {
    throw new Error(`the reader's report cannot be used (${parsed.error}); nothing recorded`);
  }
  const row = {
    ts: now(),
    doc: doc.name,
    digest: doc.digest,
    bytes: doc.bytes,
    reader: adapter.name,
    answers: parsed.answers,
    checks: checkAnswers({ repoRoot, workId, doc, answers: parsed.answers, allowedPaths }),
  };
  appendFileSync(recordsPath(repoRoot, workId), `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

// Where the work's current document stands with the reader: its latest test
// and whether the document changed since. null when it was never tested.
export function readerStanding(repoRoot, workId, docName = null) {
  const path = recordsPath(repoRoot, workId);
  if (!existsSync(path)) return null;
  let doc;
  try {
    doc = readerDoc(repoRoot, workId, docName);
  } catch {
    return null;
  }
  let latest = null;
  for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      if (row.doc === doc.name) latest = row;
    } catch {
      // Skip a line that is not JSON.
    }
  }
  if (!latest) return null;
  const answers = latest.answers ?? [];
  const body = answers.slice(0, -1);
  return {
    doc: doc.name,
    current: latest.digest === doc.digest,
    answered: body.filter(filled).length,
    questions: body.length,
    unanswered: (answers.at(-1) ?? []).length,
    checked: (latest.checks ?? []).length,
    confirmed: (latest.checks ?? []).filter((check) => check.ok).length,
    bytes: latest.bytes,
    ts: latest.ts,
  };
}

export function renderReaderStanding(standing) {
  if (!standing.current) {
    return `reader: ${standing.doc} changed since its reader test`;
  }
  return `reader: ${standing.doc} · answered ${standing.answered}/${standing.questions} · unanswered ${standing.unanswered} · checked ${standing.confirmed}/${standing.checked} · ${(standing.bytes / 1024).toFixed(1)} KB`;
}

// A worker's command and arguments with files of the repository made
// absolute: the reader does not run inside the repository, so a script or
// wrapper named relative to it would not be found.
export function absoluteArgs(repoRoot, args) {
  return args.map((arg) => (!isAbsolute(arg) && /[/.]/.test(arg) && !/^\.+$/.test(arg) && existsSync(join(repoRoot, arg)) ? join(repoRoot, arg) : arg));
}
