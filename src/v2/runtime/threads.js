// Work threads (WORK-THREADS): one requirement often takes several works: a
// second try after the first fix missed, a piece split off to another
// repository, works that touch each other. A work names the earlier works it
// follows, was split from or relates to, one line each, and external ids
// (task, decision, merge request) as `ref:` lines; the reverse directions are
// derived, so an accepted work.md never has to change. Works linked directly
// or through others form one thread. Real cost behind it: in a pilot
// workspace 53 of 113 work descriptions named another work in prose only,
// and one login problem took four works across three repositories.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { textLines } from "./closeout.js";
import { computeOverview } from "./overview.js";
import { directory, pathLabel, shellArg } from "./overview-repos.js";

const LINK = /^ {0,3}[-*+]\s+(follows|split\s+from|related)\s*:\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/i;
const REF = /^ {0,3}[-*+]\s+ref\s*:\s*([^<\s].*?)\s*$/i;
const INVERSE = { follows: "followed by", "split from": "split into", related: "related" };

// Relation and ref lines of a page, outside code blocks and HTML comments,
// and the rest of its text (prose, where a work may merely be mentioned).
export function parseLinks(text) {
  const links = [];
  const refs = [];
  const prose = [];
  for (const raw of textLines(text)) {
    const link = LINK.exec(raw);
    const ref = link ? null : REF.exec(raw);
    if (link) links.push({ kind: link[1].toLowerCase().replace(/\s+/g, " "), to: link[2] });
    else if (ref) refs.push(ref[1]);
    else prose.push(raw);
  }
  return { links, refs, prose: prose.join("\n") };
}

// Every work folder in the given checkouts, with its links, refs and prose
// from work.md (the legacy intent.md only when there is no work.md) and
// result.md.
export function readWorks(roots) {
  const works = [];
  for (const repo of roots) {
    const workRoot = join(repo, "delivery", "work");
    if (!directory(workRoot)) continue;
    for (const work of readdirSync(workRoot).sort()) {
      const dir = join(workRoot, work);
      if (!directory(dir)) continue;
      const description = existsSync(join(dir, "work.md")) ? "work.md" : "intent.md";
      const pages = [description, "result.md"]
        .map((name) => join(dir, name))
        .filter((path) => existsSync(path))
        .map((path) => parseLinks(readFileSync(path, "utf8")));
      works.push({
        repo,
        work,
        links: pages.flatMap((page) => page.links),
        refs: [...new Set(pages.flatMap((page) => page.refs))],
        prose: pages.map((page) => page.prose).join("\n"),
      });
    }
  }
  return works;
}

const keyOf = (node) => (node.missing ? `\0missing\0${node.work}` : `${node.repo}\0${node.work}`);

// Links resolved to works: the same checkout first, else every checkout in
// reach that has the id; an id found nowhere stays a missing node.
function edgesOf(works) {
  const byId = new Map();
  for (const item of works) {
    if (!byId.has(item.work)) byId.set(item.work, []);
    byId.get(item.work).push(item);
  }
  const edges = [];
  for (const from of works) {
    for (const link of from.links) {
      if (link.to === from.work) continue;
      const found = byId.get(link.to) ?? [];
      const same = found.filter((item) => item.repo === from.repo);
      const targets = same.length ? same : found;
      if (targets.length === 0) edges.push({ from, to: { work: link.to, repo: null, missing: true }, kind: link.kind });
      for (const to of targets) edges.push({ from, to, kind: link.kind });
    }
  }
  return edges;
}

function mentionPattern(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_.-])${escaped}(?![A-Za-z0-9_-])`);
}

// The thread of one work: every work linked to it directly or through
// others, each with its links seen from its own side; then the ids its
// prose mentions and the works whose prose mentions it, outside the thread.
// Ids shorter than four characters are not looked for in prose.
export function threadOf(works, repo, work) {
  const start = works.find((item) => item.repo === repo && item.work === work);
  if (!start) return null;
  const edges = edgesOf(works);
  const adjacent = new Map();
  for (const edge of edges) {
    for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      if (!adjacent.has(keyOf(a))) adjacent.set(keyOf(a), []);
      adjacent.get(keyOf(a)).push(b);
    }
  }
  const members = new Map([[keyOf(start), start]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    if (node.missing) continue;
    const next = [...(adjacent.get(keyOf(node)) ?? [])].sort((a, b) => a.work.localeCompare(b.work));
    for (const other of next) {
      if (members.has(keyOf(other))) continue;
      members.set(keyOf(other), other);
      queue.push(other);
    }
  }
  const thread = [...members.values()].map((node) => ({
    work: node.work,
    repo: node.repo,
    missing: Boolean(node.missing),
    // Its own lines first, then the reverse of other works' lines.
    links: [
      ...edges.filter((edge) => keyOf(edge.from) === keyOf(node)).map((edge) => ({ kind: edge.kind, to: edge.to.work })),
      ...edges.filter((edge) => keyOf(edge.to) === keyOf(node)).map((edge) => ({ kind: INVERSE[edge.kind], to: edge.from.work })),
    ].filter((link, index, all) => all.findIndex((item) => item.kind === link.kind && item.to === link.to) === index),
  }));
  const inThread = new Set(thread.map((node) => node.work));
  const known = [...new Set(works.map((item) => item.work))].filter((id) => id.length >= 4 && !inThread.has(id));
  const mentions = known.filter((id) => mentionPattern(id).test(start.prose)).sort();
  const pattern = work.length >= 4 ? mentionPattern(work) : null;
  const mentionedBy = pattern
    ? [...new Set(works.filter((item) => !inThread.has(item.work) && pattern.test(item.prose)).map((item) => item.work))].sort()
    : [];
  return { thread, refs: start.refs, mentions, mentionedBy };
}

// Works that carry an external id, matched exactly without regard to case.
export function worksWithRef(works, ref) {
  const wanted = ref.trim().toLowerCase();
  return works.filter((item) => item.refs.some((value) => value.toLowerCase() === wanted));
}

// Adds thread, refs, mentions and mentionedBy to status rows, with each
// thread member's stage as status reports it.
export function attachThreads(rows, roots, cwd = process.cwd()) {
  const works = readWorks(roots);
  const stages = new Map();
  const stageOf = (node) => {
    if (node.missing) return null;
    const key = keyOf(node);
    if (!stages.has(key)) {
      const row = computeOverview(node.repo, { work: node.work, cwd, repoLabel: shellArg(pathLabel(cwd, node.repo)) })[0];
      stages.set(key, row?.stage ?? null);
    }
    return stages.get(key);
  };
  for (const row of rows) {
    const repo = row.repo ?? roots[0];
    const found = threadOf(works, repo, row.work);
    if (!found) continue;
    // Fields appear only when they have something to say, so a work without
    // links keeps its status JSON exactly as before.
    if (found.thread.length > 1) {
      row.thread = found.thread.map((node) => ({
        work: node.work,
        repo: node.missing ? null : node.repo,
        ...(node.missing ? {} : { repoLabel: pathLabel(cwd, node.repo) }),
        stage: node.missing ? null : node.work === row.work && node.repo === repo ? row.stage : stageOf(node),
        links: node.links,
      }));
    }
    if (found.refs.length) row.refs = found.refs;
    if (found.mentions.length) row.mentions = found.mentions;
    if (found.mentionedBy.length) row.mentionedBy = found.mentionedBy;
  }
  return rows;
}

// The thread block under one status row.
export function renderThread(row) {
  const lines = [];
  if (row.thread?.length > 1) {
    const home = row.repo ?? null;
    lines.push(`  thread: ${row.thread.length} works`);
    for (const node of row.thread) {
      if (node.repo === null) {
        lines.push(`    ${node.work}  NOT_FOUND  (not in reach; run status --all-repos from the workspace root)`);
        continue;
      }
      const links = node.links.map((link) => `${link.kind} ${link.to}`).join(", ");
      const where = home && node.repo !== home ? ` (repo ${node.repoLabel})` : "";
      lines.push(`    ${node.work}  ${node.stage ?? "UNKNOWN"}  ${links}${where}`);
    }
  }
  if (row.refs?.length) lines.push(`  refs: ${row.refs.join(" · ")}`);
  if (row.mentions?.length) lines.push(`  mentions: ${row.mentions.join(", ")}`);
  if (row.mentionedBy?.length) lines.push(`  mentioned by: ${row.mentionedBy.join(", ")}`);
  return lines;
}
