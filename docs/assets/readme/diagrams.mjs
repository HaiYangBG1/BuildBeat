// Draws the README's diagrams (the delivery loop and the context pictures)
// in zh/en and light/dark as SVG, wide and narrow (for phones), and with
// --png also exports 2x PNGs with a transparent background through headless
// Chrome (npm pages cannot show SVG served from GitHub raw URLs).
//   node docs/assets/readme/diagrams.mjs [--png] [loop|context|handoff|owner|trace|evidence ...]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 960;
const HEIGHT = 300;
const NARROW_WIDTH = 360;
const NARROW_HEIGHT = 532;

const THEMES = {
  light: {
    text: "#1f2328", muted: "#59636e", staff: "#d0d7de", node: "#fff8ee", nodeStroke: "#e0a43a",
    accent: "#c2710c", human: "#cf3f37", humanFill: "#fff1ef", band: "#f6f8fa", bandStroke: "#d0d7de",
  },
  dark: {
    text: "#e6edf3", muted: "#9198a1", staff: "#3d444d", node: "#1d1810", nodeStroke: "#d99a2b",
    accent: "#f0a537", human: "#ff7b72", humanFill: "#2a1614", band: "#151b23", bandStroke: "#3d444d",
  },
};

const COPY = {
  zh: {
    nodes: [["work.md", "目标 · 范围 · 验收"], ["实现", "写代码 · 提交"], ["验证", "跑项目真实命令"], ["审查", "独立 · 只读"], ["你来拍板", "批准绑定候选"]],
    fix: ["修复", "有问题：修复 → 重验 → 再审"],
    band: "演奏过的乐谱留在 Git：work.md · 决定 · 审查问题 · 每轮运行的终态记录",
    bandNarrow: ["演奏过的乐谱留在 Git", "work.md · 决定 · 审查问题 · 终态记录"],
  },
  en: {
    nodes: [["work.md", "goal · scope · acceptance"], ["Build", "code · commit"], ["Verify", "real commands"], ["Review", "independent, read-only"], ["You decide", "bound to the candidate"]],
    fix: ["Fix", "findings: fix → verify → review"],
    band: "The played score stays in Git: work.md · decisions · findings · each run's final record",
    bandNarrow: ["The played score stays in Git", "work.md · decisions · findings · final records"],
  },
};

const FONT = "-apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function esc(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function svg(lang, theme) {
  const c = THEMES[theme];
  const copy = COPY[lang];
  const y = 140;
  // Widths fit the longer (English) subtitles; gaps stay even.
  const widths = [178, 124, 150, 174, 186];
  const gap = (WIDTH - 2 * 18 - widths.reduce((a, b) => a + b, 0)) / (widths.length - 1);
  let left = 18;
  const nodes = widths.map((w) => {
    const node = { x: left + w / 2, w };
    left += w + gap;
    return node;
  });
  const parts = [];
  // The staff: five faint lines behind the notes.
  for (let i = 0; i < 5; i += 1) {
    const ly = y - 16 + i * 8;
    parts.push(`<line x1="10" y1="${ly}" x2="${WIDTH - 10}" y2="${ly}" stroke="${c.staff}" stroke-width="1" opacity="0.7"/>`);
  }
  // Arrows between consecutive notes.
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i].x + nodes[i].w / 2 + 6;
    const to = nodes[i + 1].x - nodes[i + 1].w / 2 - 8;
    parts.push(`<line x1="${from}" y1="${y}" x2="${to}" y2="${y}" stroke="${c.accent}" stroke-width="2.5" marker-end="url(#arrow-${theme})"/>`);
  }
  // The fix loop above verify and review.
  const verify = nodes[2];
  const review = nodes[3];
  const fixX = (verify.x + review.x) / 2;
  const fixY = 46;
  parts.push(`<path d="M ${review.x} ${y - 30} C ${review.x} ${fixY + 6}, ${fixX + 90} ${fixY}, ${fixX + 62} ${fixY}" fill="none" stroke="${c.accent}" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrow-${theme})"/>`);
  parts.push(`<path d="M ${fixX - 62} ${fixY} C ${fixX - 90} ${fixY}, ${verify.x} ${fixY + 6}, ${verify.x} ${y - 32}" fill="none" stroke="${c.accent}" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrow-${theme})"/>`);
  parts.push(`<rect x="${fixX - 58}" y="${fixY - 18}" width="116" height="36" rx="18" fill="${c.node}" stroke="${c.nodeStroke}" stroke-width="1.5"/>`);
  parts.push(`<text x="${fixX}" y="${fixY + 5}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="${c.text}">${esc(copy.fix[0])}</text>`);
  parts.push(`<text x="${fixX}" y="${fixY - 26}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${c.muted}">${esc(copy.fix[1])}</text>`);
  // The notes: rounded tiles.
  nodes.forEach((node, i) => {
    const human = i === nodes.length - 1;
    const [title, subtitle] = copy.nodes[i];
    const left = node.x - node.w / 2;
    const stroke = human ? c.human : c.nodeStroke;
    parts.push(`<rect x="${left}" y="${y - 30}" width="${node.w}" height="60" rx="14" fill="${human ? c.humanFill : c.node}" stroke="${stroke}" stroke-width="${human ? 2 : 1.5}"/>`);
    const titleFont = title === "work.md" ? MONO : FONT;
    parts.push(`<text x="${node.x}" y="${y - 3}" text-anchor="middle" font-family="${titleFont}" font-size="16" font-weight="600" fill="${c.text}">${esc(title)}</text>`);
    parts.push(`<text x="${node.x}" y="${y + 17}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${c.muted}">${esc(subtitle)}</text>`);
    // Every note is written down in the record below.
    parts.push(`<line x1="${node.x}" y1="${y + 32}" x2="${node.x}" y2="${226}" stroke="${c.muted}" stroke-width="1.2" stroke-dasharray="2 4"/>`);
  });
  // The record band: the played score kept in Git.
  parts.push(`<rect x="18" y="228" width="${WIDTH - 36}" height="48" rx="12" fill="${c.band}" stroke="${c.bandStroke}" stroke-width="1"/>`);
  parts.push(`<text x="${WIDTH / 2}" y="${258}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="${c.text}">${esc(copy.band)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">
<defs><marker id="arrow-${theme}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${c.accent}"/></marker></defs>
${parts.join("\n")}
</svg>
`;
}

// The phone layout: the same notes stacked top to bottom, fix on the right.
function svgNarrow(lang, theme) {
  const c = THEMES[theme];
  const copy = COPY[lang];
  const nodeW = 236;
  const nodeH = 54;
  const cx = 34 + nodeW / 2;
  const ys = [68, 152, 236, 320, 404];
  const parts = [];
  // A thin staff running down the left edge, joining every note to the record.
  for (let i = 0; i < 3; i += 1) {
    parts.push(`<line x1="${12 + i * 5}" y1="${ys[0] - 20}" x2="${12 + i * 5}" y2="460" stroke="${c.staff}" stroke-width="1" opacity="0.8"/>`);
  }
  for (let i = 0; i < ys.length - 1; i += 1) {
    parts.push(`<line x1="${cx}" y1="${ys[i] + nodeH / 2 + 4}" x2="${cx}" y2="${ys[i + 1] - nodeH / 2 - 7}" stroke="${c.accent}" stroke-width="2.5" marker-end="url(#arrow-${theme}-n)"/>`);
  }
  // The fix loop to the right of verify and review.
  const right = cx + nodeW / 2;
  const fixX = 318;
  const fixY = (ys[2] + ys[3]) / 2;
  parts.push(`<path d="M ${right + 4} ${ys[3]} C ${fixX} ${ys[3]}, ${fixX} ${ys[3] - 6}, ${fixX} ${fixY + 18}" fill="none" stroke="${c.accent}" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrow-${theme}-n)"/>`);
  parts.push(`<path d="M ${fixX} ${fixY - 18} C ${fixX} ${ys[2] + 6}, ${fixX} ${ys[2]}, ${right + 8} ${ys[2]}" fill="none" stroke="${c.accent}" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrow-${theme}-n)"/>`);
  parts.push(`<rect x="${fixX - 34}" y="${fixY - 16}" width="68" height="32" rx="16" fill="${c.node}" stroke="${c.nodeStroke}" stroke-width="1.5"/>`);
  parts.push(`<text x="${fixX}" y="${fixY + 5}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="600" fill="${c.text}">${esc(copy.fix[0])}</text>`);
  ys.forEach((y, i) => {
    const human = i === ys.length - 1;
    const [title, subtitle] = copy.nodes[i];
    const left = cx - nodeW / 2;
    const stroke = human ? c.human : c.nodeStroke;
    parts.push(`<line x1="22" y1="${y}" x2="${left}" y2="${y}" stroke="${c.muted}" stroke-width="1.2" stroke-dasharray="2 4"/>`);
    parts.push(`<rect x="${left}" y="${y - nodeH / 2}" width="${nodeW}" height="${nodeH}" rx="13" fill="${human ? c.humanFill : c.node}" stroke="${stroke}" stroke-width="${human ? 2 : 1.5}"/>`);
    const titleFont = title === "work.md" ? MONO : FONT;
    parts.push(`<text x="${cx}" y="${y - 3}" text-anchor="middle" font-family="${titleFont}" font-size="16" font-weight="600" fill="${c.text}">${esc(title)}</text>`);
    parts.push(`<text x="${cx}" y="${y + 16}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${c.muted}">${esc(subtitle)}</text>`);
  });
  parts.push(`<rect x="8" y="460" width="${NARROW_WIDTH - 16}" height="60" rx="12" fill="${c.band}" stroke="${c.bandStroke}" stroke-width="1"/>`);
  parts.push(`<text x="${NARROW_WIDTH / 2}" y="485" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="600" fill="${c.text}">${esc(copy.bandNarrow[0])}</text>`);
  parts.push(`<text x="${NARROW_WIDTH / 2}" y="506" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${c.muted}">${esc(copy.bandNarrow[1])}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${NARROW_WIDTH}" height="${NARROW_HEIGHT}" viewBox="0 0 ${NARROW_WIDTH} ${NARROW_HEIGHT}" role="img">
<defs><marker id="arrow-${theme}-n" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${c.accent}"/></marker></defs>
${parts.join("\n")}
</svg>
`;
}

// The context pictures: what BuildBeat keeps next to the code, and who can
// read it. Each draw function takes (lang, theme, narrow) and returns
// { width, height, source }; they share the loop's colours and note tiles.
const EXTRA = {
  light: { ok: "#1a7f37", okFill: "#eef8f0", codeBg: "#ffffff", hl: "#fff3dc" },
  dark: { ok: "#3fb950", okFill: "#12261a", codeBg: "#0d1117", hl: "#2b2111" },
};

const FOLDER = "delivery/work/WORK-CSV-EXPORT/";
const COMMIT = ["a1b2c3d  csv: quote fields with commas", "Work: WORK-CSV-EXPORT"];
const CODE_LINES = [
  [5, "function escapeCell(value) {"],
  [6, '  const text = String(value ?? "");'],
  [7, '  return /[",\\n]/.test(text)', true],
  [8, "    ? quote(text) : text;", true],
];

const CONTEXT = {
  zh: {
    sep: "：",
    repo: "你的项目：一个 Git 仓库",
    code: ["代码", "改了什么"],
    work: ["工作记录", "为什么改、定了什么、做到哪"],
    link: ["提交带 Work 标记", "两头互查"],
    rows: [["work.md", "为什么做 · 做到什么算完"], ["decisions.jsonl", "定了什么 · 谁定的"], ["review-findings.jsonl", "审出的问题 · 怎么处理的"], ["result.md", "做成了什么 · 还剩什么"]],
    history: "同一段 Git 历史：拉下代码，两样都在",
  },
  en: {
    sep: ": ",
    repo: "Your project: one Git repository",
    code: ["Code", "what changed"],
    work: ["Work record", "why, what was decided, where it stands"],
    link: ["commits carry Work:", "trace either way"],
    rows: [["work.md", "why · what counts as done"], ["decisions.jsonl", "what was decided · by whom"], ["review-findings.jsonl", "findings · how handled"], ["result.md", "what got done · what's left"]],
    history: "One Git history: pull the code and you get both",
  },
};

const HANDOFF = {
  zh: {
    a: ["会话 A · Claude Code", "做到一半，会话太长了"],
    file: ["项目文件里的断点", "work.md · 决定 · 每轮记录"],
    b: ["会话 B · Codex", "读完文件，从断点接着干"],
    write: "写下",
    read: "读到",
    later: "几周后再捡起来",
    laterWide: ["提醒：work.md 提到的 src/export.js:5-8 改过了"],
    laterNarrow: ["提醒：work.md 提到的", "src/export.js:5-8 改过了"],
  },
  en: {
    a: ["Session A · Claude Code", "halfway there, session too long"],
    file: ["Checkpoint in project files", "work.md · decisions · each run"],
    b: ["Session B · Codex", "reads the files, carries on"],
    write: "writes",
    read: "reads",
    later: "Picked up weeks later",
    laterWide: ["Heads-up: src/export.js:5-8, mentioned in work.md, has changed"],
    laterNarrow: ["Heads-up: src/export.js:5-8,", "mentioned in work.md, has changed"],
  },
};

const OWNER = {
  zh: {
    sep: "：",
    left: ["围着人", "工具自带的记忆"],
    you: "你",
    mem: ["你的账号", "你的电脑", "你的会话"],
    peer: "同事",
    cant: "看不到",
    leftCap: "你离开项目，来龙去脉也跟着没了",
    right: ["围着项目", "BuildBeat"],
    repo: ["项目仓库", "代码 + delivery/"],
    around: ["你", "同事", "新会话", "另一个 AI 工具"],
    rightCap: ["拉下代码就有", "跟代码一起进 PR", "有版本历史"],
  },
  en: {
    sep: ": ",
    left: ["Built around a person", "a tool's own memory"],
    you: "You",
    mem: ["your account", "your computer", "your sessions"],
    peer: "Colleague",
    cant: "can't see it",
    leftCap: "When you leave, the story leaves with you",
    right: ["Built around the project", "BuildBeat"],
    repo: ["Project repo", "code + delivery/"],
    around: ["You", "Colleague", "New session", "Another AI tool"],
    rightCap: ["Comes with the code", "reviewed in PRs", "versioned"],
  },
};

const TRACE = {
  zh: {
    ask: "这行为什么这么写？",
    rows: [["目标", "导出当前筛选的账目"], ["定了", "带逗号的字段加引号"], ["审查", "第 1 轮发现没加引号，已修"], ["拍板", "批准 · 你 · 10-25 14:02"]],
  },
  en: {
    ask: "Why is this line here?",
    rows: [["Goal", "Export the filtered entries"], ["Decided", "Quote fields that contain commas"], ["Review", "Round 1: missing quotes, fixed"], ["Decision", "approved · you · 10-25 14:02"]],
  },
};
const TRACE_CMD = ["buildbeat history --repo .", "--path src/export.js:7"];

const EVIDENCE = {
  zh: {
    claim: "“改好了，测试都过了”",
    note: "AI 自己说的，不算数",
    check: "核对",
    tests: ["测试结果：BuildBeat 自己读", "跑的是项目自己的测试命令"],
    review: ["审查：另一个只读的 AI", "2 轮 · 1 个问题已修、重新测过"],
    decide: ["你拍板", "批准 · 谁 · 何时", "记进 decisions.jsonl"],
  },
  en: {
    claim: "“Done, all tests pass”",
    note: "The AI's own word doesn't count",
    check: "checked",
    tests: ["Test results: read by BuildBeat", "your project's own test commands"],
    review: ["Review: another read-only AI", "2 rounds · 1 finding fixed and retested"],
    decide: ["You decide", "approved · by whom · when", "kept in decisions.jsonl"],
  },
};

function colors(theme) {
  return { ...THEMES[theme], ...EXTRA[theme] };
}

// A rough width, enough to warn when a label would spill out of its box.
function textWidth(value, size, font) {
  let width = 0;
  for (const ch of value) width += /[⺀-￿]/.test(ch) ? size : (font === MONO ? 0.61 : 0.56) * size;
  return width;
}

const overflows = [];
function t(x, y, value, { size = 13, weight, fill, anchor = "start", font = FONT, max, pre } = {}) {
  if (max !== undefined && textWidth(value, size, font) > max) {
    overflows.push(`${value} (${Math.round(textWidth(value, size, font))} > ${max})`);
  }
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ""} fill="${fill}"${pre ? ' style="white-space:pre"' : ""}>${esc(value)}</text>`;
}

function rect(x, y, w, h, { fill = "none", stroke, width = 1.5, rx = 12, dash } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${width}"` : ""}${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function seg(x1, y1, x2, y2, { stroke, width = 2, dash, arrow, both } = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}${arrow ? ` marker-end="url(#${arrow})"` : ""}${both ? ` marker-start="url(#${arrow})"` : ""}/>`;
}


function tile(c, x, y, w, h, title, lines = [], { human, accent, dashed, size = 15 } = {}) {
  const stroke = human ? c.human : accent ? c.accent : c.nodeStroke;
  const parts = [
    rect(x, y, w, h, { fill: human ? c.humanFill : c.node, stroke, width: human || accent ? 2 : 1.5, rx: 14, dash: dashed ? "6 4" : undefined }),
  ];
  let ty = y + (h - size - lines.length * 19) / 2 + size - 2;
  parts.push(t(x + w / 2, ty, title, { size, weight: 600, fill: c.text, anchor: "middle", max: w - 24 }));
  for (const line of lines) {
    ty += 19;
    parts.push(t(x + w / 2, ty, line, { size: 12, fill: c.muted, anchor: "middle", max: w - 24 }));
  }
  return parts.join("\n");
}

function codeWindow(c, x, y, w, lines, { size = 13, lh = 22 } = {}) {
  const head = 28;
  const h = head + 6 + lines.length * lh + 8;
  const parts = [rect(x, y, w, h, { fill: c.codeBg, stroke: c.bandStroke, width: 1, rx: 10 })];
  parts.push(seg(x, y + head, x + w, y + head, { stroke: c.bandStroke, width: 1 }));
  for (let i = 0; i < 3; i += 1) parts.push(`<circle cx="${x + 14 + i * 12}" cy="${y + 14}" r="4" fill="${c.bandStroke}"/>`);
  parts.push(t(x + 56, y + 18, "src/export.js", { size: 12, fill: c.muted, font: MONO }));
  lines.forEach(([n, code, hl], i) => {
    const ly = y + head + 6 + i * lh;
    if (hl) {
      parts.push(rect(x + 1, ly, w - 2, lh, { fill: c.hl, rx: 0 }));
      parts.push(rect(x + 1, ly, 3, lh, { fill: c.accent, rx: 0 }));
    }
    parts.push(t(x + 28, ly + lh - 7, String(n), { size: size - 1, fill: c.muted, anchor: "end", font: MONO }));
    parts.push(t(x + 40, ly + lh - 7, code, { size, fill: c.text, font: MONO, max: w - 50, pre: true }));
  });
  return { parts: parts.join("\n"), h };
}

function commitCard(c, x, y, w, h, size) {
  return [
    rect(x, y, w, h, { fill: c.node, stroke: c.nodeStroke, width: 1, rx: 9 }),
    t(x + 12, y + h / 2 - 4, COMMIT[0], { size, fill: c.text, font: MONO, max: w - 24, pre: true }),
    t(x + 12, y + h / 2 + 14, COMMIT[1], { size, weight: 600, fill: c.accent, font: MONO, max: w - 24 }),
  ].join("\n");
}

// A Git history line: commits as dots, two of them the work's own.
function history(c, x1, x2, y) {
  const parts = [seg(x1, y, x2, y, { stroke: c.staff, width: 2 })];
  const n = 13;
  for (let i = 0; i < n; i += 1) {
    const cx = x1 + ((x2 - x1) * (i + 0.5)) / n;
    const own = i === 7 || i === 9;
    parts.push(`<circle cx="${cx}" cy="${y}" r="5" fill="${own ? c.accent : c.band}" stroke="${own ? c.accent : c.nodeStroke}" stroke-width="1.5"/>`);
  }
  return parts.join("\n");
}

function person(c, cx, cy, label, { faded, size = 13 } = {}) {
  const s = faded ? c.muted : c.accent;
  return [
    `<circle cx="${cx}" cy="${cy - 9}" r="8" fill="none" stroke="${s}" stroke-width="2"/>`,
    `<path d="M ${cx - 14} ${cy + 15} a 14 13 0 0 1 28 0" fill="none" stroke="${s}" stroke-width="2"/>`,
    t(cx, cy + 34, label, { size, weight: 600, fill: faded ? c.muted : c.text, anchor: "middle" }),
  ].join("\n");
}

function terminal(c, cx, cy, label, { size = 13 } = {}) {
  return [
    rect(cx - 17, cy - 14, 34, 28, { fill: c.node, stroke: c.accent, width: 2, rx: 5 }),
    t(cx - 10, cy + 5, ">_", { size: 12, weight: 700, fill: c.accent, font: MONO }),
    t(cx, cy + 34, label, { size, weight: 600, fill: c.text, anchor: "middle" }),
  ].join("\n");
}

function check(c, cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="11" fill="${c.okFill}" stroke="${c.ok}" stroke-width="2"/>\n<path d="M ${cx - 5} ${cy} l 3.5 3.5 l 6.5 -7" fill="none" stroke="${c.ok}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function cross(c, cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="10" fill="${c.humanFill}" stroke="${c.human}" stroke-width="1.5"/>\n<path d="M ${cx - 4} ${cy - 4} l 8 8 m 0 -8 l -8 8" stroke="${c.human}" stroke-width="2" stroke-linecap="round"/>`;
}

function doc(width, height, c, parts) {
  const markers = ["accent", "muted"].map((key) => `<marker id="ctx-${key}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${c[key]}"/></marker>`);
  return { width, height, source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
<defs>${markers.join("")}</defs>
${parts.join("\n")}
</svg>
` };
}

// At a glance: the code and the work record side by side in one repository.
function drawContext(lang, theme, narrow) {
  const c = colors(theme);
  const k = CONTEXT[lang];
  const p = [];
  if (!narrow) {
    const W = 960;
    const H = 352;
    const L = 32;
    const R = 556;
    const w = 372;
    p.push(rect(8, 8, W - 16, H - 16, { fill: c.band, stroke: c.bandStroke, width: 1, rx: 18 }));
    p.push(t(L, 42, k.repo, { size: 16, weight: 600, fill: c.text, max: 880 }));
    p.push(t(L, 76, k.code.join(k.sep), { size: 13, weight: 600, fill: c.muted, max: w }));
    p.push(t(R, 76, k.work.join(k.sep), { size: 13, weight: 600, fill: c.muted, max: w }));
    const code = codeWindow(c, L, 90, w, CODE_LINES);
    p.push(code.parts);
    p.push(commitCard(c, L, 90 + code.h + 10, w, 52, 12));
    p.push(t(R, 104, FOLDER, { size: 13, weight: 600, fill: c.text, font: MONO, max: w }));
    k.rows.forEach(([name, desc], i) => {
      const y = 116 + i * 42;
      p.push(rect(R, y, w, 36, { fill: c.node, stroke: c.nodeStroke, width: 1, rx: 9 }));
      p.push(t(R + 12, y + 23, name, { size: 12, weight: 600, fill: c.text, font: MONO, max: 160 }));
      p.push(t(R + 176, y + 23, desc, { size: 12, fill: c.muted, max: w - 186 }));
    });
    p.push(seg(L + w + 14, 184, R - 14, 184, { stroke: c.accent, width: 2.5, arrow: "ctx-accent", both: true }));
    p.push(t((L + w + R) / 2, 168, k.link[0], { size: 12, fill: c.muted, anchor: "middle", max: 140 }));
    p.push(t((L + w + R) / 2, 206, k.link[1], { size: 12, fill: c.muted, anchor: "middle", max: 140 }));
    p.push(history(c, 40, 920, 302));
    p.push(t(W / 2, 330, k.history, { size: 13, fill: c.muted, anchor: "middle", max: 880 }));
    return doc(W, H, c, p);
  }
  const W = 360;
  const x = 20;
  const w = 320;
  let y = 38;
  p.push(t(x, y, k.repo, { size: 15, weight: 600, fill: c.text, max: w }));
  y += 32;
  p.push(t(x, y, k.code[0], { size: 13, weight: 600, fill: c.text }));
  p.push(t(x + textWidth(k.code[0], 13) + 8, y, k.code[1], { size: 12, fill: c.muted }));
  y += 12;
  const code = codeWindow(c, x, y, w, CODE_LINES, { size: 11.5, lh: 20 });
  p.push(code.parts);
  y += code.h + 8;
  p.push(commitCard(c, x, y, w, 48, 11));
  y += 48;
  p.push(seg(60, y + 8, 60, y + 48, { stroke: c.accent, width: 2.5, arrow: "ctx-accent", both: true }));
  p.push(t(78, y + 25, k.link[0], { size: 12, fill: c.muted }));
  p.push(t(78, y + 42, k.link[1], { size: 12, fill: c.muted }));
  y += 76;
  p.push(t(x, y, k.work[0], { size: 13, weight: 600, fill: c.text }));
  p.push(t(x, y + 18, k.work[1], { size: 12, fill: c.muted, max: w }));
  y += 38;
  p.push(t(x, y, FOLDER, { size: 12, weight: 600, fill: c.text, font: MONO, max: w }));
  y += 10;
  for (const [name, desc] of k.rows) {
    p.push(rect(x, y, w, 46, { fill: c.node, stroke: c.nodeStroke, width: 1, rx: 9 }));
    p.push(t(x + 12, y + 19, name, { size: 12, weight: 600, fill: c.text, font: MONO }));
    p.push(t(x + 12, y + 37, desc, { size: 12, fill: c.muted, max: w - 24 }));
    y += 52;
  }
  y += 14;
  p.push(history(c, 28, 332, y));
  y += 28;
  p.push(t(W / 2, y, k.history, { size: 12, fill: c.muted, anchor: "middle", max: w }));
  const H = y + 22;
  p.unshift(rect(6, 6, W - 12, H - 12, { fill: c.band, stroke: c.bandStroke, width: 1, rx: 16 }));
  return doc(W, H, c, p);
}

// Point 1: one session writes the checkpoint down, the next one reads it.
function drawHandoff(lang, theme, narrow) {
  const c = colors(theme);
  const k = HANDOFF[lang];
  const p = [];
  if (!narrow) {
    const W = 960;
    const top = 30;
    const h = 76;
    const xs = [16, 350, 684];
    const w = 260;
    const my = top + h / 2;
    p.push(tile(c, xs[0], top, w, h, k.a[0], [k.a[1]]));
    p.push(tile(c, xs[1], top, w, h, k.file[0], [k.file[1]], { accent: true }));
    p.push(tile(c, xs[2], top, w, h, k.b[0], [k.b[1]]));
    for (const [i, label] of [[0, k.write], [1, k.read]]) {
      p.push(seg(xs[i] + w + 8, my, xs[i + 1] - 10, my, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
      p.push(t((xs[i] + w + xs[i + 1]) / 2, my - 10, label, { size: 12, fill: c.muted, anchor: "middle" }));
    }
    p.push(seg(xs[1] + w / 2, top + h + 4, xs[1] + w / 2, 146, { stroke: c.muted, width: 1.5, dash: "4 4", arrow: "ctx-muted" }));
    p.push(tile(c, 220, 150, 520, 64, k.later, k.laterWide, { accent: true, dashed: true }));
    return doc(W, 232, c, p);
  }
  const W = 360;
  const x = 44;
  const w = 296;
  const h = 70;
  const ys = [24, 140, 256];
  p.push(tile(c, x, ys[0], w, h, k.a[0], [k.a[1]]));
  p.push(tile(c, x, ys[1], w, h, k.file[0], [k.file[1]], { accent: true }));
  p.push(tile(c, x, ys[2], w, h, k.b[0], [k.b[1]]));
  for (const [i, label] of [[0, k.write], [1, k.read]]) {
    p.push(seg(x + w / 2, ys[i] + h + 6, x + w / 2, ys[i + 1] - 8, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
    p.push(t(x + w / 2 + 14, (ys[i] + h + ys[i + 1]) / 2 + 4, label, { size: 12, fill: c.muted }));
  }
  const ly = 362;
  const lh = 88;
  p.push(`<path d="M ${x - 4} ${ys[1] + h / 2} H 22 V ${ly + lh / 2} H ${x - 8}" fill="none" stroke="${c.muted}" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#ctx-muted)"/>`);
  p.push(tile(c, x, ly, w, lh, k.later, k.laterNarrow, { accent: true, dashed: true }));
  return doc(W, ly + lh + 16, c, p);
}

// Point 2: a tool's memory sits with one person; BuildBeat's sits with the project.
function drawOwner(lang, theme, narrow) {
  const c = colors(theme);
  const k = OWNER[lang];
  const p = [];
  const W = narrow ? 360 : 960;
  const pw = narrow ? 344 : 464;
  const ph = narrow ? 268 : 284;
  const size = narrow ? 12 : 13;
  const left = { x: 8, y: 8 };
  const rph = narrow ? 304 : ph;
  const right = narrow ? { x: 8, y: 8 + ph + 12 } : { x: 488, y: 8 };
  const titles = (box, words, color) => {
    if (!narrow) return [t(box.x + 20, box.y + 32, words.join(k.sep), { size: 14, weight: 600, fill: color, max: pw - 40 })];
    return [
      t(box.x + 16, box.y + 28, words[0], { size: 13, weight: 600, fill: color }),
      t(box.x + 16, box.y + 46, words[1], { size: 12, fill: c.muted }),
    ];
  };

  // Around a person: private memories nobody else can reach.
  p.push(rect(left.x, left.y, pw, ph, { fill: c.band, stroke: c.bandStroke, width: 1.5, rx: 16, dash: "6 5" }));
  p.push(...titles(left, k.left, c.muted));
  const youX = left.x + (narrow ? 48 : 70);
  const peerX = left.x + (narrow ? 304 : 394);
  const pillX = left.x + (narrow ? 96 : 150);
  const pillW = narrow ? 120 : 130;
  const my = left.y + 132;
  p.push(person(c, youX, my, k.you, { faded: true, size }));
  k.mem.forEach((label, i) => {
    const cy = my - 33 + i * 40;
    p.push(seg(youX + 22, my, pillX, cy, { stroke: c.muted, width: 1.2 }));
    p.push(rect(pillX, cy - 15, pillW, 30, { fill: c.codeBg, stroke: c.bandStroke, width: 1, rx: 15 }));
    p.push(t(pillX + pillW / 2, cy + 4, label, { size: 12, fill: c.muted, anchor: "middle", max: pillW - 12 }));
  });
  p.push(person(c, peerX, my, k.peer, { faded: true, size }));
  const gapMid = (pillX + pillW + peerX - 24) / 2;
  p.push(seg(pillX + pillW + 8, my + 7, peerX - 26, my + 7, { stroke: c.muted, width: 1.5, dash: "4 4" }));
  p.push(cross(c, gapMid, my + 7));
  p.push(t(gapMid, my - 12, k.cant, { size: 12, fill: c.muted, anchor: "middle" }));
  p.push(t(left.x + pw / 2, left.y + ph - 22, k.leftCap, { size: narrow ? 12 : 13, fill: c.muted, anchor: "middle", max: pw - 24 }));

  // Around the project: everyone reaches the same files.
  p.push(rect(right.x, right.y, pw, rph, { fill: c.band, stroke: c.accent, width: 2, rx: 16 }));
  p.push(...titles(right, k.right, c.text));
  const rw = narrow ? 150 : 200;
  const rh = narrow ? 64 : 72;
  const rx0 = right.x + (pw - rw) / 2;
  const ry0 = right.y + (narrow ? 112 : 104);
  const sx = [right.x + (narrow ? 48 : 70), right.x + pw - (narrow ? 56 : 70)];
  const sy = [right.y + (narrow ? 92 : 84), right.y + (narrow ? 196 : 192)];
  const spots = [[sx[0], sy[0], "person"], [sx[1], sy[0], "person"], [sx[0], sy[1], "terminal"], [sx[1], sy[1], "terminal"]];
  spots.forEach(([cx, cy], i) => {
    const toX = cx < rx0 ? rx0 : rx0 + rw;
    const toY = Math.min(Math.max(cy, ry0 + 14), ry0 + rh - 14);
    p.push(seg(cx + (cx < rx0 ? 24 : -24), cy, toX, toY, { stroke: c.accent, width: 1.8 }));
  });
  p.push(tile(c, rx0, ry0, rw, rh, k.repo[0], [k.repo[1]], { accent: true, size: narrow ? 14 : 15 }));
  spots.forEach(([cx, cy, kind], i) => {
    p.push(kind === "person" ? person(c, cx, cy, k.around[i], { size }) : terminal(c, cx, cy, k.around[i], { size }));
  });
  if (narrow) {
    p.push(t(right.x + pw / 2, right.y + rph - 32, k.rightCap[0], { size: 12, fill: c.muted, anchor: "middle", max: pw - 24 }));
    p.push(t(right.x + pw / 2, right.y + rph - 14, k.rightCap.slice(1).join(" · "), { size: 12, fill: c.muted, anchor: "middle", max: pw - 24 }));
  } else {
    p.push(t(right.x + pw / 2, right.y + rph - 22, k.rightCap.join(" · "), { size: 13, fill: c.muted, anchor: "middle", max: pw - 24 }));
  }
  return doc(W, right.y + rph + 8, c, p);
}

// Point 4: from a line of code back to the work that wrote it.
function drawTrace(lang, theme, narrow) {
  const c = colors(theme);
  const k = TRACE[lang];
  const lines = CODE_LINES.map(([n, code]) => [n, code, n === 7]);
  const p = [];
  const card = (x, y, w, h, valueX, valueSize, rowTop, rowStep) => {
    p.push(rect(x, y, w, h, { fill: c.node, stroke: c.nodeStroke, rx: 14 }));
    p.push(t(x + 18, y + 32, "WORK-CSV-EXPORT", { size: 15, weight: 600, fill: c.text, font: MONO }));
    p.push(seg(x, y + 48, x + w, y + 48, { stroke: c.bandStroke, width: 1 }));
    k.rows.forEach(([label, value], i) => {
      const ry = y + rowTop + i * rowStep;
      p.push(t(x + 18, ry, label, { size: 12, weight: 600, fill: c.muted }));
      p.push(t(x + valueX, ry, value, { size: valueSize, fill: c.text, max: w - valueX - 14 }));
    });
  };
  if (!narrow) {
    const W = 960;
    p.push(t(16, 30, k.ask, { size: 14, weight: 600, fill: c.accent }));
    const code = codeWindow(c, 16, 44, 330, lines, { lh: 24 });
    p.push(code.parts);
    const my = 44 + 28 + 6 + 2 * 24 + 12;
    p.push(seg(356, my, 560, my, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
    p.push(t(458, my - 14, TRACE_CMD[0], { size: 12, weight: 600, fill: c.text, font: MONO, anchor: "middle", max: 200 }));
    p.push(t(458, my + 22, TRACE_CMD[1], { size: 12, fill: c.muted, font: MONO, anchor: "middle", max: 200 }));
    card(572, 30, 372, 196, 100, 13, 80, 34);
    return doc(W, 242, c, p);
  }
  const W = 360;
  p.push(t(16, 28, k.ask, { size: 13, weight: 600, fill: c.accent }));
  const code = codeWindow(c, 16, 40, 328, lines, { size: 12, lh: 22 });
  p.push(code.parts);
  const y = 40 + code.h;
  p.push(seg(44, y + 10, 44, y + 66, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
  p.push(t(60, y + 34, TRACE_CMD[0], { size: 12, weight: 600, fill: c.text, font: MONO, max: 284 }));
  p.push(t(60, y + 52, TRACE_CMD[1], { size: 12, fill: c.muted, font: MONO, max: 284 }));
  card(16, y + 76, 328, 190, 92, 12, 76, 32);
  return doc(W, y + 76 + 190 + 12, c, p);
}

// Point 5: the AI's own word is checked against evidence before you decide.
function drawEvidence(lang, theme, narrow) {
  const c = colors(theme);
  const k = EVIDENCE[lang];
  const p = [];
  const bubble = (x, y, w, h, textSize) => {
    p.push(`<path d="M ${x + 30} ${y + h - 4} L ${x + 22} ${y + h + 16} L ${x + 54} ${y + h - 4}" fill="${c.band}" stroke="${c.bandStroke}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
    p.push(rect(x, y, w, h, { fill: c.band, stroke: c.bandStroke, rx: 18, dash: "5 4" }));
    p.push(t(x + w / 2, y + h / 2 + 5, k.claim, { size: textSize, fill: c.muted, anchor: "middle", max: w - 20 }));
  };
  const evidence = (x, y, w, [title, sub]) => {
    p.push(rect(x, y, w, 60, { fill: c.node, stroke: c.nodeStroke, rx: 12 }));
    p.push(check(c, x + 28, y + 30));
    p.push(t(x + 50, y + 26, title, { size: 14, weight: 600, fill: c.text, max: w - 62 }));
    p.push(t(x + 50, y + 45, sub, { size: 12, fill: c.muted, max: w - 62 }));
  };
  if (!narrow) {
    const W = 960;
    bubble(16, 52, 236, 64, 15);
    p.push(t(134, 160, k.note, { size: 12, fill: c.muted, anchor: "middle" }));
    p.push(seg(262, 84, 314, 84, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
    p.push(t(288, 72, k.check, { size: 12, fill: c.muted, anchor: "middle" }));
    evidence(326, 24, 340, k.tests);
    evidence(326, 100, 340, k.review);
    p.push(`<path d="M 672 54 C 694 54, 694 92, 704 92 M 672 130 C 694 130, 694 92, 704 92" fill="none" stroke="${c.accent}" stroke-width="2"/>`);
    p.push(seg(704, 92, 726, 92, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
    p.push(tile(c, 736, 38, 208, 108, k.decide[0], k.decide.slice(1), { human: true, size: 16 }));
    return doc(W, 184, c, p);
  }
  const W = 360;
  bubble(50, 16, 260, 60, 14);
  p.push(t(180, 112, k.note, { size: 12, fill: c.muted, anchor: "middle" }));
  p.push(seg(180, 122, 180, 152, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
  p.push(t(194, 142, k.check, { size: 12, fill: c.muted }));
  evidence(16, 160, 328, k.tests);
  evidence(16, 228, 328, k.review);
  p.push(seg(180, 294, 180, 324, { stroke: c.accent, width: 2.5, arrow: "ctx-accent" }));
  p.push(tile(c, 60, 334, 240, 100, k.decide[0], k.decide.slice(1), { human: true, size: 16 }));
  return doc(W, 450, c, p);
}

function chromeScreenshot(htmlPath, png, width, height) {
  const chromeBin = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return new Promise((done, fail) => {
    // An old PNG would look like a finished screenshot.
    rmSync(png, { force: true });
    const profile = mkdtempSync(join(tmpdir(), "bb-diagram-chrome-"));
    const child = spawn(chromeBin, ["--headless=new", "--use-mock-keychain", "--disable-gpu", "--no-first-run",
      "--hide-scrollbars", "--force-device-scale-factor=2", "--default-background-color=00000000",
      `--user-data-dir=${profile}`, `--window-size=${width},${height}`, `--screenshot=${png}`,
      pathToFileURL(htmlPath).href], { detached: true, stdio: "ignore" });
    let last = -1;
    const started = Date.now();
    const timer = setInterval(() => {
      const size = existsSync(png) ? statSync(png).size : 0;
      const settled = size > 0 && size === last;
      last = size;
      if (settled || Date.now() - started > 60000) {
        clearInterval(timer);
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
        rmSync(profile, { recursive: true, force: true });
        if (settled) done(); else fail(new Error(`no screenshot for ${htmlPath}`));
      }
    }, 500);
  });
}

const DIAGRAMS = {
  loop: (lang, theme, narrow) => (narrow
    ? { width: NARROW_WIDTH, height: NARROW_HEIGHT, source: svgNarrow(lang, theme) }
    : { width: WIDTH, height: HEIGHT, source: svg(lang, theme) }),
  context: drawContext,
  handoff: drawHandoff,
  owner: drawOwner,
  trace: drawTrace,
  evidence: drawEvidence,
};

// Names after the flags pick diagrams; none means all of them.
const args = process.argv.slice(2);
const exportPng = args.includes("--png");
const only = args.filter((arg) => !arg.startsWith("--"));
for (const name of only) {
  if (!DIAGRAMS[name]) throw new Error(`unknown diagram: ${name}`);
}
const scratch = exportPng ? mkdtempSync(join(tmpdir(), "bb-diagrams-")) : null;
for (const [diagram, draw] of Object.entries(DIAGRAMS)) {
  if (only.length > 0 && !only.includes(diagram)) continue;
  for (const lang of ["zh", "en"]) {
    for (const theme of ["light", "dark"]) {
      for (const narrow of [false, true]) {
        const name = `${diagram}-${lang}-${theme}${narrow ? "-narrow" : ""}`;
        const { width, height, source } = draw(lang, theme, narrow);
        writeFileSync(join(HERE, `${name}.svg`), source);
        if (exportPng) {
          const htmlPath = join(scratch, `${name}.html`);
          writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>${source}</body></html>`);
          await chromeScreenshot(htmlPath, join(HERE, `${name}.png`), width, height);
        }
        console.log(name);
      }
    }
  }
}
if (scratch) rmSync(scratch, { recursive: true, force: true });
if (overflows.length > 0) console.warn(`text that may not fit its box:\n  ${overflows.join("\n  ")}`);
