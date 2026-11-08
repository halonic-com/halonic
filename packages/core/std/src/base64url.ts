// Base64url without padding (RFC 4648, section 5), as PKCE and JSON Web Tokens
// use it. Written out because `Buffer` doesn't exist in workerd and
// `Uint8Array.toBase64` and `Uint8Array.fromBase64` aren't everywhere yet.

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url characters only; padding is never used. */
const base64urlPattern = /^[A-Za-z0-9_-]*$/;

/**
 * Writes bytes as base64url, without padding.
 *
 * @param bytes - the bytes to encode
 * @returns the text, using only `A-Z`, `a-z`, `0-9`, `-` and `_`
 *
 * @example
 * encodeBase64url(new Uint8Array([0xfb, 0xff])); // "-_8"
 */
export function encodeBase64url(bytes: Uint8Array): string {
  let text = "";
  for (let start = 0; start < bytes.length; start += 3) {
    const chunk = bytes.subarray(start, start + 3);
    const bits = ((chunk[0] ?? 0) << 16) | ((chunk[1] ?? 0) << 8) | (chunk[2] ?? 0);
    // Three bytes give four characters; a shorter last chunk gives one fewer per missing byte.
    const characters = chunk.length + 1;
    for (let index = 0; index < characters; index += 1) {
      text += alphabet[(bits >> (18 - 6 * index)) & 63];
    }
  }
  return text;
}

/**
 * Reads strict base64url text back into bytes: no padding, no other
 * characters, and no stray bits after the last byte. So each byte string has
 * exactly one text that reads as it.
 *
 * @param text - the text to decode
 * @returns the bytes, or `undefined` when the text isn't strict base64url
 *
 * @example
 * decodeBase64url("-_8"); // Uint8Array [0xfb, 0xff]
 * decodeBase64url("-_9"); // undefined: the last character has stray bits
 */
export function decodeBase64url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!base64urlPattern.test(text) || text.length % 4 === 1) {
    return undefined;
  }
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let written = 0;
  for (let start = 0; start < text.length; start += 4) {
    const chunk = text.slice(start, start + 4);
    let bits = 0;
    for (let index = 0; index < 4; index += 1) {
      bits = (bits << 6) | (index < chunk.length ? alphabet.indexOf(chunk.charAt(index)) : 0);
    }
    // Four characters give three bytes; a shorter last chunk gives one fewer per missing character.
    const byteCount = chunk.length - 1;
    const strayBits = bits & ((1 << (8 * (3 - byteCount))) - 1);
    if (strayBits !== 0) {
      return undefined;
    }
    for (let index = 0; index < byteCount; index += 1) {
      bytes[written] = (bits >> (16 - 8 * index)) & 0xff;
      written += 1;
    }
  }
  return bytes;
}
