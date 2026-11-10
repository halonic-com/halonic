/**
 * Reads and applies unified diffs in git's format, for the memory Vcs's
 * `applyPatch`. The git adapter leaves this to `git apply`. Like
 * `line-diff.ts`, generic enough for `@halonicjs/std` once that package has
 * its text helpers.
 *
 * A hunk applies only where its old lines, context included, match the file
 * exactly. Like `git apply`, it may sit at another line than its header says,
 * when lines were added or removed above it, but nothing fuzzier. Anything
 * but a text file's lines changing is refused (`git-diff-header.ts`), and so
 * is a patch that changes one file twice.
 *
 * One known difference from `git apply`: git makes a hunk that starts at
 * line 1 match only at the start of the file, and a hunk with no context
 * after it match only at the end. Here such a hunk may match anywhere its
 * lines are, like any other.
 */

import {
  checkAgainstSection,
  fileWithoutLines,
  type GitDiffSection,
  readGitDiffHeader,
  startGitDiffSection,
} from "./git-diff-header.ts";
import { PatchFormatError, PatchMismatchError } from "./patch-errors.ts";

/** One hunk: the lines it expects and the lines it leaves, each with its newline when it has one. */
export interface Hunk {
  /** The hunk's first old line, counted from 1; for a hunk with no old lines, the line it follows. */
  oldStart: number;
  /** The same for its new lines: where they start once the hunks before it are applied. */
  newStart: number;
  oldLines: string[];
  newLines: string[];
}

/** The changes to one file. A `null` path means the file isn't there on that side. */
export interface FilePatch {
  oldPath: string | null;
  newPath: string | null;
  hunks: Hunk[];
}

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;

/**
 * The file patches in `patch`, in order.
 *
 * @throws PatchFormatError when it holds no file, a quoted path, anything
 *   but a text file's lines changing, or a hunk whose lines don't match its
 *   header
 */
export function parsePatch(patch: string): FilePatch[] {
  const lines = patch.split("\n");
  const files: FilePatch[] = [];
  // The `diff --git` section whose `---` line hasn't come yet.
  let section: GitDiffSection | null = null;
  let at = 0;
  while (at < lines.length) {
    const line = lines[at] as string;
    if (line.startsWith("diff --git ")) {
      if (section !== null) files.push({ ...fileWithoutLines(section), hunks: [] });
      section = startGitDiffSection(line);
      at++;
    } else if (line.startsWith("--- ")) {
      const { file, next } = readFilePatch(lines, at);
      if (section !== null) checkAgainstSection(file, section);
      files.push(file);
      section = null;
      at = next;
    } else {
      readGitDiffHeader(line, section);
      at++;
    }
  }
  if (section !== null) files.push({ ...fileWithoutLines(section), hunks: [] });
  if (files.length === 0) throw new PatchFormatError("it changes no file");
  refuseRepeatedPaths(files);
  return files;
}

/**
 * Refuses a patch that changes one file in two sections. Each section reads
 * the file as it was, so the second would silently replace the first's result.
 *
 * @throws PatchFormatError naming the first path that comes back
 */
function refuseRepeatedPaths(files: FilePatch[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    const path = filePath(file);
    if (seen.has(path)) throw new PatchFormatError(`it changes ${path} more than once`);
    seen.add(path);
  }
}

/** Reads the file whose `---` line is at `lines[at]`, with its hunks; returns it and the index after it. */
function readFilePatch(lines: string[], at: number): { file: FilePatch; next: number } {
  const file = readFileHeader(lines[at] as string, lines[at + 1] ?? "");
  let next = at + 2;
  while (hunkHeader.test(lines[next] ?? "")) {
    const read = readHunk(lines, next);
    file.hunks.push(read.hunk);
    next = read.next;
  }
  return { file, next };
}

/** The patch that undoes `file`. */
export function reversePatch(file: FilePatch): FilePatch {
  return {
    oldPath: file.newPath,
    newPath: file.oldPath,
    hunks: file.hunks.map((hunk) => ({
      oldStart: hunk.newStart,
      newStart: hunk.oldStart,
      oldLines: hunk.newLines,
      newLines: hunk.oldLines,
    })),
  };
}

/**
 * The file's text after `file` is applied to `current` (`null` when the
 * file doesn't exist); `null` when the patch deletes it.
 *
 * @throws PatchMismatchError when it doesn't apply cleanly
 */
export function applyFilePatch(current: string | null, file: FilePatch): string | null {
  const mismatch = new PatchMismatchError(filePath(file));
  if ((current === null) !== (file.oldPath === null)) throw mismatch;
  const lines = splitLines(current ?? "");
  const out: string[] = [];
  let done = 0;
  let shift = 0;
  for (const hunk of file.hunks) {
    const at = findHunk(lines, hunk, done, shift);
    if (at === null) throw mismatch;
    out.push(...lines.slice(done, at), ...hunk.newLines);
    shift = at - startIndex(hunk);
    done = at + hunk.oldLines.length;
  }
  out.push(...lines.slice(done));
  const text = out.join("");
  if (file.newPath !== null) return text;
  // A deletion must take every line with it.
  if (text !== "") throw mismatch;
  return null;
}

/** The one path a file patch has: `parsePatch` refuses none on either side, and a rename. */
function filePath(file: FilePatch): string {
  return (file.newPath ?? file.oldPath) as string;
}

/** The lines of `text`, each with its newline, as `line-diff.ts` splits them. */
function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
}

/** A file patch, with no hunks yet, from its `---` and `+++` lines. */
function readFileHeader(oldHeader: string, newHeader: string): FilePatch {
  if (!newHeader.startsWith("+++ ")) {
    throw new PatchFormatError(`no "+++" line after ${oldHeader}`);
  }
  const oldPath = headerPath(oldHeader.slice(4));
  const newPath = headerPath(newHeader.slice(4));
  if (oldPath === null && newPath === null) {
    throw new PatchFormatError("a file with no path on either side");
  }
  if (oldPath !== null && newPath !== null && oldPath !== newPath) {
    throw new PatchFormatError("renames aren't supported; rename the file first");
  }
  return { oldPath, newPath, hunks: [] };
}

/** `a/agents/x.yaml` -> `agents/x.yaml`; `/dev/null` -> `null`. */
function headerPath(raw: string): string | null {
  // git adds a tab and a date after the path in some formats.
  const path = raw.split("\t")[0] as string;
  if (path === "/dev/null") return null;
  if (path.startsWith('"')) throw new PatchFormatError(`quoted path ${path}`);
  if (!path.startsWith("a/") && !path.startsWith("b/")) {
    throw new PatchFormatError(`path ${path} has no a/ or b/ prefix`);
  }
  return path.slice(2);
}

const noNewline = "\\ No newline at end of file";

/** Reads the hunk whose header is at `lines[at]`; returns it and the index after it. */
function readHunk(lines: string[], at: number): { hunk: Hunk; next: number } {
  // Only called on a line the pattern matched.
  const header = hunkHeader.exec(lines[at] as string) as RegExpExecArray;
  // Like git, a range of one line has no count.
  const oldCount = Number(header[2] ?? "1");
  const newCount = Number(header[4] ?? "1");
  const hunk: Hunk = {
    oldStart: Number(header[1]),
    newStart: Number(header[3]),
    oldLines: [],
    newLines: [],
  };
  const wantsMore = (next: number) =>
    hunk.oldLines.length < oldCount || hunk.newLines.length < newCount || lines[next] === noNewline;
  let next = at + 1;
  let lastSides: string[][] = [];
  for (; wantsMore(next); next++) {
    const line = lines[next];
    if (line === undefined) throw new PatchFormatError(`hunk ${lines[at]} ends early`);
    lastSides = addHunkLine(hunk, line, lastSides);
  }
  if (hunk.oldLines.length !== oldCount || hunk.newLines.length !== newCount) {
    throw new PatchFormatError(`hunk ${lines[at]} doesn't match its line counts`);
  }
  return { hunk, next };
}

/**
 * Adds one line of a hunk's body to the side or sides it belongs to, and
 * returns those sides, which a "No newline" marker after it applies to.
 */
function addHunkLine(hunk: Hunk, line: string, lastSides: string[][]): string[][] {
  const text = `${line.slice(1)}\n`;
  if (line === noNewline) {
    // Takes the newline off the line before, on each side it was on.
    for (const side of lastSides) side.push((side.pop() as string).slice(0, -1));
    return lastSides;
  }
  // Some editors strip the space from an empty context line.
  if (line.startsWith(" ") || line === "") {
    hunk.oldLines.push(text);
    hunk.newLines.push(text);
    return [hunk.oldLines, hunk.newLines];
  }
  if (line.startsWith("-")) {
    hunk.oldLines.push(text);
    return [hunk.oldLines];
  }
  if (line.startsWith("+")) {
    hunk.newLines.push(text);
    return [hunk.newLines];
  }
  throw new PatchFormatError(`unexpected line ${JSON.stringify(line)} in a hunk`);
}

/** Where the hunk's old lines start, as an index into the file's lines. */
function startIndex(hunk: Hunk): number {
  // A hunk with no old lines follows line `oldStart`; one with old lines starts at it.
  return hunk.oldLines.length === 0 ? hunk.oldStart : hunk.oldStart - 1;
}

/**
 * Where in `lines` the hunk's old lines are: at its header's line moved by
 * `shift` if they are there, else the nearest place at or after `from`;
 * `null` when they are nowhere at or after `from`.
 */
function findHunk(lines: string[], hunk: Hunk, from: number, shift: number): number | null {
  const expected = startIndex(hunk) + shift;
  const last = lines.length - hunk.oldLines.length;
  for (let distance = 0; distance <= lines.length; distance++) {
    for (const at of [expected - distance, expected + distance]) {
      if (at >= from && at <= last && matchesAt(lines, hunk.oldLines, at)) return at;
    }
  }
  return null;
}

function matchesAt(lines: string[], expected: string[], at: number): boolean {
  return expected.every((line, offset) => lines[at + offset] === line);
}

/**
 * What each file the patch touches becomes (`null`: deleted), read through
 * `read`, without writing anything; with `reverse`, what undoing it gives.
 * Every path goes through `checkPath` first.
 *
 * @throws PatchFormatError (a `RangeError`), PatchMismatchError, or what
 *   `checkPath` throws
 */
export async function patchedFiles(
  patch: string,
  reverse: boolean,
  checkPath: (path: string) => void,
  read: (path: string) => Promise<string | null>,
): Promise<Map<string, string | null>> {
  const files = parsePatch(patch).map((file) => (reverse ? reversePatch(file) : file));
  for (const file of files) {
    for (const path of [file.oldPath, file.newPath]) if (path !== null) checkPath(path);
  }
  const results = new Map<string, string | null>();
  for (const file of files) {
    const path = filePath(file);
    results.set(path, applyFilePatch(await read(path), file));
  }
  return results;
}
