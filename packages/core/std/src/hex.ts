/**
 * Writes bytes as lowercase hexadecimal text, two characters per byte.
 *
 * @param bytes - the bytes to write
 * @returns the hex text, empty for no bytes
 *
 * @example
 * bytesToHex(new Uint8Array([0, 171, 255])); // "00abff"
 */
export function bytesToHex(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    text += byte.toString(16).padStart(2, "0");
  }
  return text;
}
