// Renders README.md and README.en.md the way GitHub does (its markdown API),
// then screenshots each page in headless Chrome: light and dark at desktop
// width, light at phone width. Pictures that point at the main branch on
// GitHub are mapped to this checkout, so the candidate's own assets show.
// Network or browser trouble exits 75 (infrastructure, not a defect).
// Headless Chrome on macOS writes its output and then does not exit, so each
// call waits for the output (the dumped page or a settled PNG) and then ends
// the browser's whole process group.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = process.argv[2];
const root = process.cwd();
const RAW = "https://raw.githubusercontent.com/HaiYangBG1/BuildBeat/main/";
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const scratch = mkdtempSync(join(tmpdir(), "bb-readme-render-"));

function infra(message) {
  console.error(`render-readme: ${message}`);
  rmSync(scratch, { recursive: true, force: true });
  process.exit(75);
}
if (!out) infra("no screenshot directory given");
if (!existsSync(CHROME)) infra(`Chrome not found at ${CHROME}`);

function fetchText(url) {
  const res = spawnSync("curl", ["-fsSL", "--max-time", "30", url], { encoding: "utf8" });
  if (res.status !== 0) infra(`cannot fetch ${url}`);
  return res.stdout;
}
const css = {
  light: fetchText("https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.css"),
  dark: fetchText("https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-dark.css"),
};

function render(file) {
  // GitHub drops file:// sources and keeps the main-branch URLs, so the
  // pictures are mapped to this checkout after rendering.
  const input = join(scratch, "input.md");
  writeFileSync(input, readFileSync(join(root, file), "utf8"));
  const res = spawnSync("gh", ["api", "-X", "POST", "/markdown", "-f", "mode=gfm",
    "-f", "context=HaiYangBG1/BuildBeat", "-F", `text=@${input}`], { encoding: "utf8" });
  if (res.status !== 0) infra(`GitHub markdown API failed: ${res.stderr.trim()}`);
  return res.stdout.replaceAll(RAW, pathToFileURL(`${root}/`).href);
}

// Headless Chrome keeps a minimum window width of about 500px, so the page is
// pinned to the requested width from the left edge instead of centered.
function page(html, scheme, width) {
  const background = scheme === "dark" ? "#0d1117" : "#ffffff";
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${css[scheme]}</style>
<style>html,body{margin:0;background:${background}}
.markdown-body{box-sizing:border-box;width:${width}px;margin:0;padding:${width < 600 ? 16 : 45}px}</style>
</head><body><article class="markdown-body">${html}</article>
<script>addEventListener("load", () => document.documentElement.setAttribute("data-height",
  String(Math.ceil(document.documentElement.scrollHeight))));</script>
</body></html>`;
}

function chromeOnce(args, { file = null } = {}) {
  return new Promise((done) => {
    const child = spawn(CHROME, ["--headless=new", "--use-mock-keychain", "--disable-gpu",
      "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
      "--allow-file-access-from-files", "--virtual-time-budget=10000",
      `--user-data-dir=${join(scratch, "profile")}`, ...args],
    { detached: true, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    let lastSize = -1;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    const started = Date.now();
    const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } };
    const timer = setInterval(() => {
      let finished = false;
      if (file) {
        const size = existsSync(file) ? statSync(file).size : 0;
        finished = size > 0 && size === lastSize;
        lastSize = size;
      } else {
        finished = stdout.includes("</html>");
      }
      if (finished || Date.now() - started > 45000) {
        clearInterval(timer);
        stop();
        done(finished ? stdout : null);
      }
    }, 500);
  });
}

// External pictures (badges) can stall a page load; one retry, then infra.
async function chrome(args, options) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (options?.file) rmSync(options.file, { force: true });
    const output = await chromeOnce(args, options);
    if (output !== null) return output;
  }
  return infra(`Chrome produced no output for ${args.at(-1)}`);
}

const html = { "README.md": render("README.md"), "README.en.md": render("README.en.md") };
const shots = [
  ["README.md", "zh", "light", 1012],
  ["README.md", "zh", "dark", 1012],
  ["README.md", "zh", "light", 390],
  ["README.en.md", "en", "light", 1012],
  ["README.en.md", "en", "dark", 1012],
  ["README.en.md", "en", "light", 390],
];
for (const [file, lang, scheme, width] of shots) {
  const htmlPath = join(scratch, `${lang}-${scheme}-${width}.html`);
  writeFileSync(htmlPath, page(html[file], scheme, width));
  const url = pathToFileURL(htmlPath).href;
  const schemeFlag = `--blink-settings=preferredColorScheme=${scheme === "dark" ? 0 : 1}`;
  const dom = await chrome([schemeFlag, `--window-size=${width},1000`, "--dump-dom", url]);
  const height = Number(dom.match(/data-height="(\d+)"/)?.[1] ?? 0);
  if (!height) infra(`could not measure the rendered ${file}`);
  const png = join(out, `readme-${lang}-${scheme}-${width}.png`);
  await chrome([schemeFlag, `--window-size=${width},${Math.min(height, 16000)}`, `--screenshot=${png}`, url], { file: png });
  if (!existsSync(png)) infra(`no screenshot written for ${file}`);
  console.log(`${png} (${width}x${height})`);
}
rmSync(scratch, { recursive: true, force: true });
