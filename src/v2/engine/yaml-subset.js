// Fail-closed strict YAML subset parser for BuildBeat v2 config files.
// Supports exactly what the official presets need: nested maps, block lists
// (indented under their key or at the key's own indentation), the empty
// inline [] and {}, and plain/quoted scalars with space indentation.
// Everything else — tabs, anchors, aliases, tags, block/flow scalars,
// non-empty inline collections, multi-document streams, duplicate keys — is
// rejected with a line number and a way to rewrite it, never guessed at.

export class YamlSubsetError extends Error {
  constructor(message, lineNo) {
    super(lineNo ? `line ${lineNo}: ${message}` : message);
    this.name = "YamlSubsetError";
    this.lineNo = lineNo ?? null;
  }
}

const KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;
// A list item is a map only when it starts like one: a valid key, then ": "
// or a colon at the end of the line.
const MAP_ITEM = /^[A-Za-z0-9_.-]+:( |$)/;
const FORBIDDEN_SCALAR_START = ["&", "*", "!", "|", ">", "{", "[", "%", "@", "`"];

function parseScalar(raw, lineNo) {
  const text = raw.trim();
  if (text.startsWith('"')) {
    if (!text.endsWith('"') || text.length < 2) {
      throw new YamlSubsetError(`unterminated double-quoted string: ${text}`, lineNo);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new YamlSubsetError(`invalid double-quoted string: ${text}`, lineNo);
    }
  }
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) {
      throw new YamlSubsetError(`unterminated single-quoted string: ${text}`, lineNo);
    }
    const inner = text.slice(1, -1);
    if (inner.includes("'")) {
      throw new YamlSubsetError("single-quoted escapes are not supported", lineNo);
    }
    return inner;
  }
  if (/^\[\s*\]$/.test(text)) return [];
  if (/^\{\s*\}$/.test(text)) return {};
  if (text[0] === "[" || text[0] === "{") {
    throw new YamlSubsetError(
      `inline lists/maps are not supported except [] and {}; write one "- item" per line (or "key: value" per line): ${text}`,
      lineNo,
    );
  }
  if (FORBIDDEN_SCALAR_START.includes(text[0])) {
    throw new YamlSubsetError(`unsupported YAML syntax at: ${text}`, lineNo);
  }
  if (text.includes(" #")) {
    throw new YamlSubsetError("trailing comments are not supported; move the comment to its own line", lineNo);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  // Leading zeros are kept as written (007 would otherwise silently be 7).
  if (/^-?0\d+$/.test(text)) return text;
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text);
  return text;
}

function splitKeyValue(content, lineNo) {
  const colon = content.indexOf(":");
  if (colon === -1) {
    throw new YamlSubsetError(`expected "key: value", got: ${content}`, lineNo);
  }
  const key = content.slice(0, colon);
  if (!KEY_PATTERN.test(key)) {
    throw new YamlSubsetError(`unsupported map key: ${key}`, lineNo);
  }
  const rest = content.slice(colon + 1);
  if (rest === "") {
    return { key, value: null };
  }
  if (!rest.startsWith(" ")) {
    throw new YamlSubsetError(`expected a space after "${key}:"`, lineNo);
  }
  return { key, value: rest.slice(1) };
}

function toLines(text) {
  const lines = [];
  const rawLines = text.split("\n");
  for (const [index, raw] of rawLines.entries()) {
    const lineNo = index + 1;
    if (raw.includes("\t")) {
      throw new YamlSubsetError("tabs are not allowed", lineNo);
    }
    const withoutCr = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const trimmed = withoutCr.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed === "---" || trimmed === "...") {
      throw new YamlSubsetError("multi-document YAML is not supported", lineNo);
    }
    const indent = withoutCr.length - withoutCr.trimStart().length;
    lines.push({ indent, content: trimmed, lineNo });
  }
  return lines;
}

function parseNode(lines, start, indent) {
  const first = lines[start];
  if (first.content === "-" || first.content.startsWith("- ")) {
    return parseList(lines, start, indent);
  }
  return parseMap(lines, start, indent);
}

function parseList(lines, start, indent) {
  const result = [];
  let index = start;
  while (index < lines.length && lines[index].indent >= indent) {
    const line = lines[index];
    if (line.indent !== indent) {
      throw new YamlSubsetError(`bad indentation in list (expected ${indent} spaces)`, line.lineNo);
    }
    if (line.content !== "-" && !line.content.startsWith("- ")) {
      break;
    }
    const itemIndent = indent + 2;
    const inline = line.content === "-" ? "" : line.content.slice(2).trim();
    const childLines = [];
    if (inline !== "") {
      childLines.push({ indent: itemIndent, content: inline, lineNo: line.lineNo });
    }
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor].indent >= itemIndent) {
      childLines.push(lines[cursor]);
      cursor += 1;
    }
    if (childLines.length === 0) {
      throw new YamlSubsetError("empty list item", line.lineNo);
    }
    const first = childLines[0].content;
    const quotedScalar = first.startsWith('"') || first.startsWith("'");
    if (childLines.length > 1) {
      // Multi-line items keep the previous rule and messages unchanged.
      if (!quotedScalar && first.includes(":")) {
        result.push(parseMapFromLines(childLines, itemIndent));
      } else {
        throw new YamlSubsetError("unsupported list item shape", line.lineNo);
      }
      index = cursor;
      continue;
    }
    if (!quotedScalar && MAP_ITEM.test(first)) {
      result.push(parseMapFromLines(childLines, itemIndent));
    } else if (!quotedScalar && (first.includes(": ") || first.endsWith(":"))) {
      // Real YAML reads "echo a: b" as a map; rather than guess, ask for quotes.
      throw new YamlSubsetError(
        `list item ${JSON.stringify(first)} contains ": "; quote it (- ${JSON.stringify(first)}) or write it as key: value`,
        line.lineNo,
      );
    } else {
      result.push(parseScalar(first, childLines[0].lineNo));
    }
    index = cursor;
  }
  return { value: result, next: index };
}

function parseMapFromLines(childLines, indent) {
  const { value, next } = parseMap(childLines, 0, indent);
  if (next !== childLines.length) {
    throw new YamlSubsetError("unexpected trailing content in map", childLines[next].lineNo);
  }
  return value;
}

function parseMap(lines, start, indent) {
  const result = {};
  let index = start;
  while (index < lines.length && lines[index].indent >= indent) {
    const line = lines[index];
    if (line.indent !== indent) {
      throw new YamlSubsetError(`bad indentation in map (expected ${indent} spaces)`, line.lineNo);
    }
    if (line.content === "-" || line.content.startsWith("- ")) {
      break;
    }
    const { key, value } = splitKeyValue(line.content, line.lineNo);
    if (Object.hasOwn(result, key)) {
      throw new YamlSubsetError(`duplicate map key: ${key}`, line.lineNo);
    }
    if (value !== null) {
      result[key] = parseScalar(value, line.lineNo);
      index += 1;
      continue;
    }
    const childStart = index + 1;
    const child = lines[childStart];
    // A list may sit at its key's own indentation ("key:" then "- a").
    if (child && child.indent === indent && (child.content === "-" || child.content.startsWith("- "))) {
      const parsed = parseList(lines, childStart, indent);
      result[key] = parsed.value;
      index = parsed.next;
      continue;
    }
    if (!child || child.indent <= indent) {
      throw new YamlSubsetError(
        `key "${key}" has no value: give it a value, write ${key}: [] for an empty list, or indent its items under it`,
        line.lineNo,
      );
    }
    const parsed = parseNode(lines, childStart, lines[childStart].indent);
    result[key] = parsed.value;
    index = parsed.next;
  }
  return { value: result, next: index };
}

export function parseYamlSubset(text) {
  // A byte-order mark (Windows editors) is not content.
  const lines = toLines(text.replace(/^\uFEFF/, ""));
  if (lines.length === 0) {
    throw new YamlSubsetError("empty document");
  }
  if (lines[0].indent !== 0) {
    throw new YamlSubsetError("document must start at column 0", lines[0].lineNo);
  }
  const { value, next } = parseNode(lines, 0, 0);
  if (next !== lines.length) {
    throw new YamlSubsetError("unexpected trailing content", lines[next].lineNo);
  }
  return value;
}
