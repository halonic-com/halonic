/** A screen's still as the overlay draws it: its size in device pixels and its RGBA rows. */
export interface StillImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

/** Width and height, each a little-endian u32, come before the rows. */
const headerBytes = 8;

/**
 * The still in the bytes `plugin:feedback|crop` answers with: width and height as two
 * little-endian u32s, then `width × height` RGBA pixels. Anything else is refused, so a short
 * answer never draws a torn picture.
 */
export function readStill(answer: unknown): StillImage {
  const bytes = bytesOf(answer);
  if (bytes.byteLength < headerBytes) throw new Error("The still has no size.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, headerBytes);
  const width = header.getUint32(0, true);
  const height = header.getUint32(4, true);
  const rgbaBytes = bytes.byteLength - headerBytes;
  const rgba = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset + headerBytes, rgbaBytes);
  if (width === 0 || height === 0 || rgba.byteLength !== width * height * 4) {
    throw new Error(`The still's ${rgba.byteLength} bytes aren't ${width} × ${height} pixels.`);
  }
  return { width, height, rgba };
}

/**
 * The answer's bytes. Over Tauri's custom protocol they come as an `ArrayBuffer`; over its
 * postMessage IPC, which the desktop windows use while their policy has no `connect-src ipc:`,
 * as a JSON array of numbers (HAL-19757).
 */
function bytesOf(answer: unknown): Uint8Array {
  if (answer instanceof ArrayBuffer) return new Uint8Array(answer);
  if (ArrayBuffer.isView(answer)) {
    return new Uint8Array(answer.buffer, answer.byteOffset, answer.byteLength);
  }
  if (Array.isArray(answer) && answer.every(isByte)) return Uint8Array.from(answer);
  throw new Error("The still isn't bytes.");
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}
