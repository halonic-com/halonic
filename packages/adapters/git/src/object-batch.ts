// Reading several objects with one `git cat-file --batch` call (HAL-7589).

import type { Repository } from "./repository.ts";

/** One object `cat-file --batch` found. */
export interface BatchObject {
  /** Its id, in hex. */
  id: string;
  /** `commit`, `tree`, `blob` or `tag`. */
  type: string;
  /** Its stored bytes: no filter or textconv runs, as `--batch` is given neither. */
  content: Buffer;
}

/** The header git writes before an object it found: `<id> <type> <size>`. */
const foundHeader = /^([0-9a-f]{40}|[0-9a-f]{64}) ([a-z]+) (\d+)$/u;

/**
 * Whether `name` can go on a line of `cat-file --batch`'s input. git reads
 * up to the line break and drops a `\r` before it, so a name with either
 * would be read as another one.
 */
export function fitsOnBatchLine(name: string): boolean {
  return !/[\n\r]/u.test(name);
}

/**
 * Reads the objects `names` give, such as `<commit>` or `<commit>:<path>`,
 * with one git call: the object for each name, in order, or `null` for a
 * name the repository has no object for. The caller checks each name with
 * {@link fitsOnBatchLine} first.
 *
 * @throws Error when git fails, or its output isn't what `--batch` writes
 */
export async function readObjects(
  repository: Repository,
  names: readonly string[],
): Promise<(BatchObject | null)[]> {
  const input = Buffer.from(names.map((name) => `${name}\n`).join(""), "utf8");
  const output = await repository.output({ args: ["cat-file", "--batch"], input });
  return parseBatch(output, names.length);
}

/**
 * Reads the output of `cat-file --batch` for `count` names. git answers a
 * name it found with `<id> <type> <size>\n<content>\n`, and any other with
 * the name and why, such as `<name> missing\n`.
 *
 * @throws Error when the output is cut short or doesn't follow that form
 */
export function parseBatch(output: Buffer, count: number): (BatchObject | null)[] {
  const objects: (BatchObject | null)[] = [];
  let at = 0;
  for (let index = 0; index < count; index++) {
    const lineEnd = output.indexOf("\n", at);
    if (lineEnd === -1) throw unexpectedBatch("it ends early");
    const header = foundHeader.exec(output.toString("utf8", at, lineEnd));
    at = lineEnd + 1;
    if (header === null) {
      objects.push(null);
      continue;
    }
    const [, id = "", type = "", size = ""] = header;
    const contentEnd = at + Number(size);
    if (output[contentEnd] !== 0x0a) throw unexpectedBatch(`the object ${id} is cut short`);
    objects.push({ id, type, content: output.subarray(at, contentEnd) });
    at = contentEnd + 1;
  }
  return objects;
}

function unexpectedBatch(reason: string): Error {
  return new Error(`git cat-file --batch gave unexpected output: ${reason}.`);
}

/** One entry of a tree object. */
export interface TreeEntry {
  /** The mode as git stored it, in octal, such as `100644` or `40000`. */
  mode: string;
  /** The name's bytes: git doesn't keep names as text of any encoding. */
  name: Buffer;
  /** The id of the object it names, in hex. */
  id: string;
}

/**
 * The entries of a tree object's stored bytes: each one is
 * `<mode> <name>\0` followed by the id in `idBytes` raw bytes.
 *
 * @param idBytes - 20 in a SHA-1 repository, 32 in a SHA-256 one
 * @throws Error when the bytes aren't a tree
 */
export function treeEntries(tree: Buffer, idBytes: number): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let at = 0;
  while (at < tree.length) {
    const space = tree.indexOf(" ", at);
    const nul = tree.indexOf(0, space + 1);
    if (space === -1 || nul === -1 || nul + 1 + idBytes > tree.length) {
      throw new Error("git gave a tree object that isn't one.");
    }
    entries.push({
      mode: tree.toString("latin1", at, space),
      name: tree.subarray(space + 1, nul),
      id: tree.toString("hex", nul + 1, nul + 1 + idBytes),
    });
    at = nul + 1 + idBytes;
  }
  return entries;
}

/**
 * Whether a tree entry's mode is a regular file. git once stored modes such
 * as `100664` too, which `ls-tree` shows as `100644`, so only the file type
 * counts: a link (`120000`), a submodule (`160000`) or a folder (`40000`)
 * has no text to read.
 */
export function isRegularFileMode(mode: string): boolean {
  return /^[0-7]+$/u.test(mode) && (Number.parseInt(mode, 8) & 0o170000) === 0o100000;
}
