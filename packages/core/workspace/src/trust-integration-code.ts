// The hash of a local integration's code for the trust content (trust build
// plan item 3a, HAL-188). Halonic itself starts this code in the runner, so
// a change to any file in the folder asks for trust again.

import type { Digest } from "@halonicjs/ports";
import { bytesToHex, canonicalJson, encodeUtf8 } from "@halonicjs/std";

/** One file of a local integration's folder. */
export interface IntegrationFile {
  /**
   * Its path relative to the integration's folder, with `/` between
   * segments, such as `src/index.js`, as {@link isCleanRelativePath} accepts.
   */
  readonly path: string;
  /** Its bytes, as on disk. */
  readonly bytes: Uint8Array;
}

/**
 * The hash of every file in a local integration's folder: `sha256:` and the
 * SHA-256, in hex, of the list of each file's path and SHA-256, sorted by
 * path, written as canonical JSON and preceded by its length in bytes. Each
 * file is hashed on its own, so a caller can read one file at a time.
 *
 * The caller reads the folder. It must refuse a symbolic link rather than
 * follow it or leave it out, so a link can't change what runs without
 * changing the hash.
 *
 * @param files - every file in the folder, in any order
 * @param digest - the port that hashes; the core has no hash code of its own
 * @returns the hash, such as "sha256:9f86d081…"
 * @throws RangeError when a path isn't a clean relative path, or two files have the same path
 *
 * @example
 * await integrationCodeDigest([{ path: "index.js", bytes }], digest); // "sha256:3b1f…"
 */
export async function integrationCodeDigest(
  files: Iterable<IntegrationFile> | AsyncIterable<IntegrationFile>,
  digest: Digest,
): Promise<string> {
  const hashes = new Map<string, string>();
  for await (const file of files) {
    checkPath(file.path);
    if (hashes.has(file.path)) {
      throw new RangeError(`Two files have the path "${file.path}".`);
    }
    hashes.set(file.path, bytesToHex(await digest.sha256(file.bytes)));
  }
  const list = [...hashes].sort(([left], [right]) => compareText(left, right));
  const json = encodeUtf8(canonicalJson(list));
  const length = encodeUtf8(`${json.length}\n`);
  const encoded = new Uint8Array(length.length + json.length);
  encoded.set(length, 0);
  encoded.set(json, length.length);
  return `sha256:${bytesToHex(await digest.sha256(encoded))}`;
}

/**
 * Whether a path is relative, uses `/` between segments, and has only
 * segments that name the same file on every system: not empty, without `\`,
 * `:` or a control character, and not ending in `.` or a space (so no `.`,
 * `..` or `C:`). Windows drops a trailing `.` or space, so `a.js.` and
 * `a.js` would be one file there.
 */
export function isCleanRelativePath(path: string): boolean {
  return path.split("/").every(isCleanSegment);
}

function isCleanSegment(segment: string): boolean {
  return (
    segment !== "" &&
    !segment.includes("\\") &&
    !segment.includes(":") &&
    ![...segment].some(isControlCharacter) &&
    !segment.endsWith(".") &&
    !segment.endsWith(" ")
  );
}

/** NUL to U+001F, and DEL. */
function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
}

/** Refuses a path that {@link isCleanRelativePath} doesn't accept. */
function checkPath(path: string): void {
  if (!isCleanRelativePath(path)) {
    throw new RangeError(
      `"${path}" isn't a clean path relative to the integration's folder, such as "src/index.js".`,
    );
  }
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
