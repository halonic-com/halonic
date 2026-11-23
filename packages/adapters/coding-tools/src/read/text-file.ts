import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ToolRefusal } from "../tool-input.ts";

/** How many bytes at a file's start are looked at to tell a binary file. */
const binaryCheckBytes = 8_192;

/** A text file as the tools read it. */
export interface TextFile {
  /** Its lines, without line breaks; a last line break starts no extra line. */
  readonly lines: readonly string[];
  /** A digest of its bytes, to tell whether it changed since an earlier read. */
  readonly digest: string;
}

/**
 * Whether the bytes look like a binary file: a NUL byte in the first 8 KB,
 * as Git and ripgrep decide it.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, binaryCheckBytes).includes(0);
}

/**
 * Reads a text file that the caller already found allowed, after checking
 * its size, so a huge file is refused before it is read.
 *
 * @param real - the file's real path
 * @param size - its size, as the caller found it
 * @param maxBytes - the largest file read
 * @param shown - how the answer names it
 * @throws {ToolRefusal} for a file above `maxBytes` or a binary file
 */
export async function readTextFile(
  real: string,
  size: number,
  maxBytes: number,
  shown: string,
): Promise<TextFile> {
  if (size > maxBytes) {
    throw new ToolRefusal(
      `'${shown}' has ${size} bytes, more than the ${maxBytes} this tool reads; use search to find the lines you need.`,
    );
  }
  const bytes = await readFile(real);
  if (looksBinary(bytes)) throw new ToolRefusal(`'${shown}' is a binary file.`);
  return { lines: textLines(bytes.toString("utf8")), digest: digestOf(bytes) };
}

/** A text's lines, split at `\n` or `\r\n`; the empty piece after a last line break is no line. */
export function textLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function digestOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
