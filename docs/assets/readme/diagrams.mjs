// Draws the README's delivery-loop diagram in zh/en and light/dark as SVG,
// and with --png also exports 2x PNGs with a transparent background through
// headless Chrome (npm pages cannot show SVG served from GitHub raw URLs).
//   node docs/assets/readme/diagrams.mjs [--png]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 960;
const HEIGHT = 300;

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
    nodes: [["work.md", "目标 · 范围 · 验收"], ["实现", "build"], ["验证", "跑项目真实命令"], ["审查", "独立 · 只读"], ["你来拍板", "批准绑定候选"]],
    fix: ["修复", "有问题：修复 → 重验 → 再审"],
    band: "演奏过的乐谱留在 Git：work.md · 决定 · 审查问题 · 运行台账 · 证据",
  },
  en: {
    nodes: [["work.md", "goal · scope · acceptance"], ["Build", "builder"], ["Verify", "real commands"], ["Review", "independent, read-only"], ["You decide", "bound to the candidate"]],
    fix: ["Fix", "findings: fix → verify → review"],
    band: "The played score stays in Git: work.md · decisions · findings · run ledger · evidence",
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
  // The notes: rounded tiles with a stem and a flag, like the hero picture.
  nodes.forEach((node, i) => {
    const human = i === nodes.length - 1;
    const [title, subtitle] = copy.nodes[i];
    const left = node.x - node.w / 2;
    const stroke = human ? c.human : c.nodeStroke;
    parts.push(`<rect x="${left}" y="${y - 30}" width="${node.w}" height="60" rx="14" fill="${human ? c.humanFill : c.node}" stroke="${stroke}" stroke-width="${human ? 2 : 1.5}"/>`);
    const stemX = left + node.w - 14;
    parts.push(`<line x1="${stemX}" y1="${y - 30}" x2="${stemX}" y2="${y - 56}" stroke="${stroke}" stroke-width="2"/>`);
    parts.push(`<path d="M ${stemX} ${y - 56} q 10 4 12 14" fill="none" stroke="${stroke}" stroke-width="2"/>`);
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

function chromeScreenshot(htmlPath, png) {
  const chromeBin = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return new Promise((done, fail) => {
    const profile = mkdtempSync(join(tmpdir(), "bb-diagram-chrome-"));
    const child = spawn(chromeBin, ["--headless=new", "--use-mock-keychain", "--disable-gpu", "--no-first-run",
      "--hide-scrollbars", "--force-device-scale-factor=2", "--default-background-color=00000000",
      `--user-data-dir=${profile}`, `--window-size=${WIDTH},${HEIGHT}`, `--screenshot=${png}`,
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

const exportPng = process.argv.includes("--png");
const scratch = exportPng ? mkdtempSync(join(tmpdir(), "bb-diagrams-")) : null;
for (const lang of ["zh", "en"]) {
  for (const theme of ["light", "dark"]) {
    const name = `loop-${lang}-${theme}`;
    const source = svg(lang, theme);
    writeFileSync(join(HERE, `${name}.svg`), source);
    if (exportPng) {
      const htmlPath = join(scratch, `${name}.html`);
      writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>${source}</body></html>`);
      await chromeScreenshot(htmlPath, join(HERE, `${name}.png`));
    }
    console.log(name);
  }
}
if (scratch) rmSync(scratch, { recursive: true, force: true });
