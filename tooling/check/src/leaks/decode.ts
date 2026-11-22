/**
 * Turns a file's bytes into the text the rules read. Every file is read,
 * also one with NUL bytes: a file the guard skipped as "binary" would be
 * a file it never checked.
 */

/** Swaps each pair of bytes, so UTF-16 big-endian reads as little-endian. */
function swapPairs(bytes: Buffer): Buffer {
  const swapped = Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2)));
  return swapped.swap16();
}

/**
 * Decodes a file by its byte-order mark: UTF-16 (either order) or UTF-8.
 * Without a mark it is read as UTF-8 with its NUL bytes left out, so text
 * written as UTF-16 without a mark still reads as its letters.
 */
export function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return swapPairs(bytes.subarray(2)).toString("utf16le");
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString("utf8");
  }
  return bytes.toString("utf8").replaceAll("\0", "");
}

/**
 * True when a line from a diff can't be read as it stands: it holds a NUL
 * byte or bytes that aren't UTF-8, as in a UTF-16 file. The guard then
 * reads the whole file instead.
 */
export function needsWholeFile(text: string): boolean {
  return text.includes("\0") || text.includes("\ufffd");
}

/** A file's text as numbered lines, every line counted as added. */
export function numberedLines(text: string): { number: number; text: string }[] {
  return text.split("\n").map((line, index) => ({ number: index + 1, text: line }));
}
