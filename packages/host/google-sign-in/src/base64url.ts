// Base64url without padding, as RFC 7636 asks for the PKCE verifier and
// challenge. Written out because `Buffer` doesn't exist in workerd and
// `Uint8Array.toBase64` isn't everywhere yet. Decoding is only needed for the
// payload of Google's ID token. HAL-771 moves both into @halonicjs/std.

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * The bytes as base64url, without padding.
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

/** Base64url characters only; padding is never used. */
const base64urlPattern = /^[A-Za-z0-9_-]*$/;

/**
 * Reads base64url text, without padding, back into bytes.
 *
 * @param text - the text to decode
 * @returns the bytes, or `undefined` when the text isn't base64url
 *
 * @example
 * decodeBase64url("-_8"); // Uint8Array [0xfb, 0xff]
 */
export function decodeBase64url(text: string): Uint8Array | undefined {
  if (!base64urlPattern.test(text) || text.length % 4 === 1) {
    return undefined;
  }
  const bytes: number[] = [];
  for (let start = 0; start < text.length; start += 4) {
    const chunk = text.slice(start, start + 4);
    let bits = 0;
    for (let index = 0; index < 4; index += 1) {
      bits = (bits << 6) | (index < chunk.length ? alphabet.indexOf(chunk.charAt(index)) : 0);
    }
    // Four characters give three bytes; a shorter last chunk gives one fewer per missing character.
    const byteCount = chunk.length - 1;
    for (let index = 0; index < byteCount; index += 1) {
      bytes.push((bits >> (16 - 8 * index)) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
