// Screenshot files (requireScreenshot). Only PNG is accepted, checked to
// the point where every pixel can be reconstructed, without a dependency:
// the chunk layout a decoder relies on (one IHDR first, at most one PLTE
// before the image data, consecutive IDAT, IEND last, no unknown critical
// chunk, every CRC), a legal header and palette, and image data that
// inflates to exactly the scanlines the header declares (Adam7 passes
// included), each with a valid filter that reconstructs, palette indices
// inside the palette. Owner decision 2026-10-04: JPEG and WebP cannot be
// checked that far without a decoder, and headless browser screenshots are
// PNG by default. A decodable image still proves only a whole picture, not
// the right page: the reviewer and the person deciding judge the content.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Colour type -> channels and the bit depths the PNG specification allows.
const PNG_COLOR = {
  0: { channels: 1, depths: [1, 2, 4, 8, 16] },
  2: { channels: 3, depths: [8, 16] },
  3: { channels: 1, depths: [1, 2, 4, 8] },
  4: { channels: 2, depths: [8, 16] },
  6: { channels: 4, depths: [8, 16] },
};
const CRITICAL = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
// Adam7 passes: x start, y start, x step, y step.
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// The images (width x height) the data holds: one for a plain image, up to
// seven reduced ones for an interlaced image.
function subImages(header) {
  if (header.interlace === 0) {
    return [[header.width, header.height]];
  }
  return ADAM7.map(([x0, y0, dx, dy]) => [
    header.width > x0 ? Math.ceil((header.width - x0) / dx) : 0,
    header.height > y0 ? Math.ceil((header.height - y0) / dy) : 0,
  ]).filter(([w, h]) => w > 0 && h > 0);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Reconstructs every scanline (filters 0-4) and, for an indexed image,
// checks each pixel's palette index.
function scanlinesValid(raw, header, paletteSize) {
  const bits = header.depth * PNG_COLOR[header.color].channels;
  const bpp = Math.max(1, bits / 8);
  let offset = 0;
  for (const [width, height] of subImages(header)) {
    const rowBytes = Math.ceil((width * bits) / 8);
    let prev = Buffer.alloc(rowBytes);
    for (let row = 0; row < height; row += 1) {
      if (offset + 1 + rowBytes > raw.length) {
        return false;
      }
      const filter = raw[offset];
      if (filter > 4) {
        return false;
      }
      const line = Buffer.from(raw.subarray(offset + 1, offset + 1 + rowBytes));
      for (let i = 0; i < rowBytes; i += 1) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const predictor =
          filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        line[i] = (line[i] + predictor) & 0xff;
      }
      if (header.color === 3) {
        for (let x = 0; x < width; x += 1) {
          const bit = x * header.depth;
          const index =
            (line[bit >> 3] >> (8 - header.depth - (bit & 7))) & ((1 << header.depth) - 1);
          if (index >= paletteSize) {
            return false;
          }
        }
      }
      prev = line;
      offset += 1 + rowBytes;
    }
  }
  return offset === raw.length;
}

function validPng(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }
  let offset = 8;
  let header = null;
  let paletteSize = 0;
  let dataState = "none"; // none -> open -> closed
  const data = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      return false;
    }
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) {
      return false;
    }
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) {
      return false;
    }
    const critical = type[0] === type[0].toUpperCase();
    if (critical && !CRITICAL.has(type)) {
      return false;
    }
    if (!header) {
      if (type !== "IHDR" || length !== 13) {
        return false;
      }
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        color: body[9],
        compression: body[10],
        filter: body[11],
        interlace: body[12],
      };
      const color = PNG_COLOR[header.color];
      if (
        !header.width ||
        !header.height ||
        header.width > 0x7fffffff ||
        header.height > 0x7fffffff ||
        !color ||
        !color.depths.includes(header.depth) ||
        header.compression !== 0 ||
        header.filter !== 0 ||
        header.interlace > 1
      ) {
        return false;
      }
    } else if (type === "IHDR") {
      return false;
    } else if (type === "PLTE") {
      const entries = length / 3;
      if (
        paletteSize > 0 ||
        dataState !== "none" ||
        header.color === 0 ||
        header.color === 4 ||
        length % 3 !== 0 ||
        entries < 1 ||
        entries > 256 ||
        (header.color === 3 && entries > 1 << header.depth)
      ) {
        return false;
      }
      paletteSize = entries;
    } else if (type === "IDAT") {
      if (dataState === "closed") {
        return false;
      }
      dataState = "open";
      data.push(body);
    } else if (type === "IEND") {
      if (
        length !== 0 ||
        end !== bytes.length ||
        data.length === 0 ||
        (header.color === 3 && paletteSize === 0)
      ) {
        return false;
      }
      let raw;
      try {
        raw = inflateSync(Buffer.concat(data));
      } catch {
        return false;
      }
      return scanlinesValid(raw, header, paletteSize);
    } else if (dataState === "open") {
      dataState = "closed";
    }
    offset = end;
  }
  return false;
}

const OTHER_IMAGE = /\.(jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i;

// What a file in BUILDBEAT_SCREENSHOT_DIR is: a PNG to check, another image
// format to reject by name, or null for files that are not screenshots.
export function screenshotFormat(name) {
  if (/\.png$/i.test(name)) {
    return { label: "png", valid: validPng };
  }
  if (OTHER_IMAGE.test(name)) {
    return { unsupported: true };
  }
  return null;
}

// One screenshot file on disk, judged the same way at capture, at cache
// reuse and at approval: { ok, digest } or { ok: false, reason }.
export function checkScreenshotFile(path) {
  const name = basename(path);
  const format = screenshotFormat(name);
  if (!format) {
    return { ok: false, reason: `${name} (not a screenshot)` };
  }
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return { ok: false, reason: `${name} (missing)` };
  }
  if (!stat.isFile()) {
    return { ok: false, reason: `${name} (not a regular file)` };
  }
  if (format.unsupported) {
    return { ok: false, reason: `${name} (only PNG screenshots are accepted)` };
  }
  const bytes = readFileSync(path);
  if (!format.valid(bytes)) {
    return { ok: false, reason: `${name} (not a decodable PNG)` };
  }
  return {
    ok: true,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}
