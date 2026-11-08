// Base64url without padding, as RFC 7636 asks for the PKCE verifier and
// challenge. Written out because `Buffer` doesn't exist in workerd and
// `Uint8Array.toBase64` isn't everywhere yet. Only encoding is needed here:
// nothing in this package reads base64url back.

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
