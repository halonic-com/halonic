// Turns what `adb exec-out screencap` writes (raw RGBA pixels) into a 24-bit
// PNG with no alpha channel, the format Google Play asks for (HAL-6953).
// Writing the PNG here keeps the capture script free of image tools.
//
//   node screencap-to-png.mjs <raw-file> <png-file>

import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";
import { crc32, deflateSync } from "node:zlib";

/** Android's `PixelFormat.RGBA_8888`, the only format the emulator's screencap writes. */
const RGBA_8888 = 1;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads screencap's header (width, height, format and, since Android 12, a colour space). */
function readScreencap(raw) {
  const width = raw.readUInt32LE(0);
  const height = raw.readUInt32LE(4);
  const format = raw.readUInt32LE(8);
  const headerBytes = raw.length - width * height * 4;
  if (format !== RGBA_8888 || (headerBytes !== 12 && headerBytes !== 16)) {
    throw new Error(
      `Not an RGBA screencap: ${width} × ${height}, format ${format}, ${raw.length} bytes.`,
    );
  }
  return { width, height, pixels: raw.subarray(headerBytes) };
}

/** PNG scanlines: each row starts with filter type 0 (none), then R, G, B per pixel. */
function rgbScanlines({ width, height, pixels }) {
  const rowBytes = 1 + width * 3;
  const scanlines = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const to = y * rowBytes + 1 + x * 3;
      scanlines[to] = pixels[from];
      scanlines[to + 1] = pixels[from + 1];
      scanlines[to + 2] = pixels[from + 2];
    }
  }
  return scanlines;
}

function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

function encodeRgbPng(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // colour type 2: truecolour, no alpha
  // Bytes 10 to 12 stay 0: deflate, standard filtering, no interlacing.
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rgbScanlines(image), { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const [rawFile, pngFile] = argv.slice(2);
if (rawFile === undefined || pngFile === undefined) {
  console.error("Usage: node screencap-to-png.mjs <raw-file> <png-file>");
  exit(2);
}
const image = readScreencap(readFileSync(rawFile));
writeFileSync(pngFile, encodeRgbPng(image));
console.log(`Saved ${pngFile} (${image.width} × ${image.height}, 24-bit, no transparency).`);
