// Screenshot files (requireScreenshot). The runner accepts an image only
// when it is structurally complete for its format: a failed or truncated
// capture is not a rendering. This proves a whole image, not that it shows
// the right page — the reviewer and the person deciding judge the content.

import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

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

// Signature, IHDR first with non-zero size, every chunk inside the file
// with a matching CRC, IDAT data that inflates (to exactly the scanlines
// a non-interlaced image needs), and IEND.
function validPng(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }
  let offset = 8;
  let header = null;
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
        interlace: body[12],
      };
      if (!header.width || !header.height || PNG_CHANNELS[header.color] === undefined) {
        return false;
      }
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      if (data.length === 0) {
        return false;
      }
      let raw;
      try {
        raw = inflateSync(Buffer.concat(data));
      } catch {
        return false;
      }
      if (header.interlace !== 0) {
        return raw.length > 0;
      }
      const rowBytes = Math.ceil((header.width * header.depth * PNG_CHANNELS[header.color]) / 8);
      return raw.length === header.height * (rowBytes + 1);
    }
    offset = end;
  }
  return false;
}

const JPEG_FRAMES = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// SOI, segments that fit the file, a frame header with non-zero size before
// the scan, and the end-of-image marker.
function validJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    return false;
  }
  let offset = 2;
  let frame = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return false;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) {
      return false;
    }
    if (JPEG_FRAMES.has(marker)) {
      if (length < 8) {
        return false;
      }
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      frame = height > 0 && width > 0;
    }
    if (marker === 0xda) {
      return frame;
    }
    offset += 2 + length;
  }
  return false;
}

// RIFF length matching the file, and a VP8, VP8L or VP8X first chunk that
// fits and declares its size.
function validWebp(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WEBP" ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  ) {
    return false;
  }
  const chunk = bytes.toString("latin1", 12, 16);
  const size = bytes.readUInt32LE(16);
  if (20 + size > bytes.length) {
    return false;
  }
  const body = bytes.subarray(20, 20 + size);
  if (chunk === "VP8 ") {
    return (
      body.length >= 10 &&
      body[3] === 0x9d &&
      body[4] === 0x01 &&
      body[5] === 0x2a &&
      (body.readUInt16LE(6) & 0x3fff) > 0 &&
      (body.readUInt16LE(8) & 0x3fff) > 0
    );
  }
  if (chunk === "VP8L") {
    return body.length >= 5 && body[0] === 0x2f;
  }
  if (chunk === "VP8X") {
    return body.length >= 10;
  }
  return false;
}

const FORMATS = [
  { name: /\.png$/i, label: "png", valid: validPng },
  { name: /\.jpe?g$/i, label: "jpeg", valid: validJpeg },
  { name: /\.webp$/i, label: "webp", valid: validWebp },
];

// The image format a file name claims, or null for files that are not
// screenshots at all.
export function screenshotFormat(name) {
  return FORMATS.find((format) => format.name.test(name)) ?? null;
}
