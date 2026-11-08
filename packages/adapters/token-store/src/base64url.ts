// Base64url without padding, written out because `Buffer` doesn't exist in
// workerd and `Uint8Array.fromBase64` isn't everywhere yet.

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const strictPattern = /^[A-Za-z0-9_-]*$/;

/** The bytes as base64url, without padding. */
export function encodeBase64url(bytes: Uint8Array): string {
  let text = "";
  for (let start = 0; start < bytes.length; start += 3) {
    const chunk = bytes.subarray(start, start + 3);
    const bits = ((chunk[0] ?? 0) << 16) | ((chunk[1] ?? 0) << 8) | (chunk[2] ?? 0);
    const characters = chunk.length + 1;
    for (let index = 0; index < characters; index += 1) {
      text += alphabet[(bits >> (18 - 6 * index)) & 63];
    }
  }
  return text;
}

/**
 * The bytes of a base64url text, or `undefined` when the text isn't strict
 * base64url: no padding, no other characters, and no stray bits at the end.
 */
export function decodeBase64url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!strictPattern.test(text) || text.length % 4 === 1) {
    return undefined;
  }
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let written = 0;
  for (let start = 0; start < text.length; start += 4) {
    const chunk = text.slice(start, start + 4);
    let bits = 0;
    for (let index = 0; index < 4; index += 1) {
      bits = (bits << 6) | (index < chunk.length ? alphabet.indexOf(chunk[index] ?? "") : 0);
    }
    const byteCount = chunk.length - 1;
    const strayBits = bits & ((1 << (8 * (3 - byteCount))) - 1);
    if (strayBits !== 0) {
      return undefined;
    }
    for (let index = 0; index < byteCount; index += 1) {
      bytes[written] = (bits >> (16 - 8 * index)) & 255;
      written += 1;
    }
  }
  return bytes;
}
