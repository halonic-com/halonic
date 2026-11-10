/**
 * The lines git writes between `diff --git` and a file's `---` line, for
 * `text-patch.ts`. They are where a patch says it does more than change a
 * text file's lines: a mode change, a symbolic link, a gitlink, a rename, a
 * copy or a binary change. The memory Vcs refuses all of those, as the git
 * adapter does (plan for HAL-3245, rule 5): a symbolic link to `.git` would
 * let a later patch write the repository's config.
 */

import { PatchFormatError } from "./patch-errors.ts";

/** What a `diff --git` section has said so far about its one file. */
export interface GitDiffSection {
  /** The path in the `diff --git a/<path> b/<path>` line. */
  path: string;
  /** A `new file mode` line: the file doesn't exist before. */
  created: boolean;
  /** A `deleted file mode` line: the file doesn't exist after. */
  deleted: boolean;
}

/** A plain file. Only an `index` line may say executable: editing one's lines keeps its mode. */
const plainFileMode = "100644";
const indexModes = new Set([plainFileMode, "100755"]);

/** Header lines that only a mode change, a rename or a copy has. */
const unsupportedHeaders = [
  "old mode ",
  "new mode ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
  "similarity index ",
  "dissimilarity index ",
];

/**
 * The section a `diff --git` line starts. Its two paths must be the same:
 * two different ones mean a rename or a copy.
 *
 * @throws PatchFormatError for a quoted path, or two different paths
 */
export function startGitDiffSection(line: string): GitDiffSection {
  const paths = line.slice("diff --git ".length);
  if (paths.startsWith('"')) throw new PatchFormatError(`quoted path in ${line}`);
  // "a/<path> b/<path>": the path takes half of what is left after "a/", " b/".
  const path = paths.slice(2, 2 + (paths.length - 5) / 2);
  if (paths !== `a/${path} b/${path}`) {
    throw new PatchFormatError(`${line} names two paths; renames and copies aren't supported`);
  }
  return { path, created: false, deleted: false };
}

/**
 * Checks one line outside a hunk, and notes in `section` (when there is one)
 * a file it creates or deletes. Lines it doesn't know, such as a commit
 * message before the patch, it leaves alone, as `git apply` does.
 *
 * @throws PatchFormatError for anything but a text file's lines changing
 */
export function readGitDiffHeader(line: string, section: GitDiffSection | null): void {
  if (line.startsWith("Binary files ") || line === "GIT binary patch") {
    throw new PatchFormatError("binary changes aren't supported");
  }
  const unsupported = unsupportedHeaders.find((start) => line.startsWith(start));
  if (unsupported !== undefined) {
    throw new PatchFormatError(`"${unsupported.trim()}" isn't supported, only text edits`);
  }
  if (line.startsWith("new file mode ")) {
    requirePlainFile(line, "new file mode ");
    if (section !== null) section.created = true;
  } else if (line.startsWith("deleted file mode ")) {
    requirePlainFile(line, "deleted file mode ");
    if (section !== null) section.deleted = true;
  } else if (line.startsWith("index ")) {
    // "index <old>..<new>", with " <mode>" after it when the mode stays the same.
    const mode = line.split(" ")[2];
    if (mode !== undefined && !indexModes.has(mode)) throw unsupportedMode(mode);
  }
}

function requirePlainFile(line: string, start: string): void {
  const mode = line.slice(start.length);
  if (mode !== plainFileMode) throw unsupportedMode(mode);
}

function unsupportedMode(mode: string): PatchFormatError {
  // 120000 is a symbolic link, 160000 a gitlink, 100755 a new executable.
  return new PatchFormatError(`mode ${mode} isn't supported, only plain text files`);
}

/**
 * The file a section with no `---` line changes: git writes none for an
 * empty file it creates or deletes.
 *
 * @throws PatchFormatError when the section neither creates nor deletes a file
 */
export function fileWithoutLines(section: GitDiffSection): {
  oldPath: string | null;
  newPath: string | null;
} {
  if (section.created && !section.deleted) return { oldPath: null, newPath: section.path };
  if (section.deleted && !section.created) return { oldPath: section.path, newPath: null };
  throw new PatchFormatError(`the change to ${section.path} has no "---" line`);
}

/**
 * Checks that a file's `---` and `+++` paths agree with its section, so the
 * `diff --git` line can't name one file while the lines change another.
 * `/dev/null` fits any section: `line-diff.ts` writes no `new file mode`.
 *
 * @throws PatchFormatError when they don't
 */
export function checkAgainstSection(
  file: { oldPath: string | null; newPath: string | null },
  section: GitDiffSection,
): void {
  const namesAnother = [file.oldPath, file.newPath].some(
    (path) => path !== null && path !== section.path,
  );
  const createdButHasOld = section.created && file.oldPath !== null;
  const deletedButHasNew = section.deleted && file.newPath !== null;
  if (namesAnother || createdButHasOld || deletedButHasNew) {
    throw new PatchFormatError(`the lines for ${section.path} don't match its diff --git header`);
  }
}
