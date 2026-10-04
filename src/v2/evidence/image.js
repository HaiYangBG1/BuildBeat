// Screenshot files (requireScreenshot). Only PNG is accepted, checked to
// the point of decoding without a dependency: signature, every chunk's CRC,
// a legal header, a palette where the colour type needs one, and pixel data
// that inflates to exactly the scanlines (interlaced passes included) with
// a valid filter type on every row. Owner decision 2026-10-04: JPEG and
// WebP cannot be checked that far without a decoder, and headless browser
// screenshots are PNG by default. A decodable image still proves only a
// whole picture, not the right page: the reviewer and the person deciding
// judge the content.

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

// The images (width x height) the pixel data holds: one for a plain image,
// up to seven reduced ones for an interlaced image.
function subImages(header) {
  if (header.interlace === 0) {
    return [[header.width, header.height]];
  }
  return ADAM7.map(([x0, y0, dx, dy]) => [
    header.width > x0 ? Math.ceil((header.width - x0) / dx) : 0,
    header.height > y0 ? Math.ceil((header.height - y0) / dy) : 0,
  ]).filter(([w, h]) => w > 0 && h > 0);
}

function scanlinesValid(raw, header) {
  const bits = header.depth * PNG_COLOR[header.color].channels;
  let offset = 0;
  for (const [width, height] of subImages(header)) {
    const rowBytes = Math.ceil((width * bits) / 8);
    for (let row = 0; row < height; row += 1) {
      if (offset >= raw.length || raw[offset] > 4) {
        return false;
      }
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
  let palette = false;
  const data = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      return false;
    }
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) {
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
        !color ||
        !color.depths.includes(header.depth) ||
        header.compression !== 0 ||
        header.filter !== 0 ||
        header.interlace > 1
      ) {
        return false;
      }
    } else if (type === "PLTE") {
      palette = length > 0 && length % 3 === 0;
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      if (data.length === 0 || (header.color === 3 && !palette)) {
        return false;
      }
      let raw;
      try {
        raw = inflateSync(Buffer.concat(data));
      } catch {
        return false;
      }
      return scanlinesValid(raw, header);
    }
    offset = end;
  }
  return false;
}

const PNG = { label: "png", valid: validPng };
const OTHER_IMAGE = /\.(jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i;

// What a file in BUILDBEAT_SCREENSHOT_DIR is: a PNG to check, another image
// format to reject by name, or null for files that are not screenshots.
export function screenshotFormat(name) {
  if (/\.png$/i.test(name)) {
    return PNG;
  }
  if (OTHER_IMAGE.test(name)) {
    return { unsupported: true };
  }
  return null;
}
