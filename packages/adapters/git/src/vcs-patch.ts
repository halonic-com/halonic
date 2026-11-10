import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConfigEntry } from "./hardening.ts";
import type { Repository } from "./repository.ts";
import { checkVcsPaths } from "./vcs-input.ts";
import { nulSeparated } from "./vcs-versions.ts";

/**
 * Applies `patch` to the working tree with `git apply`, not to the index;
 * with `reverse`, undoes it. `git apply` checks every part before it writes
 * any, so nothing changes when one doesn't apply.
 *
 * Before that, every path goes through the port's path rules twice: as the
 * patch's headers write it, and as git reads it (`--numstat`), which
 * tidies some, such as `a//b.yaml` into `a/b.yaml`. So neither a path git
 * would tidy nor one git would read differently gets past.
 *
 * @throws RangeError for a patch that does more than change a text file's
 *   lines (see {@link plainTextPatchPaths}), that git can't read, or that
 *   names a path the port refuses
 * @throws Error `The change no longer matches the file.` when it doesn't apply cleanly
 */
export async function applyToWorkingTree(
  repository: Repository,
  patch: string,
  reverse: boolean,
): Promise<void> {
  const written = plainTextPatchPaths(patch);
  await checkVcsPaths(repository.top, written);
  // In git's own folder, never in the working tree; the name is new each time.
  const patchFile = join(repository.gitDir, `halonic-patch-${randomUUID()}.diff`);
  await writeFile(patchFile, patch, "utf8");
  try {
    const read = await repository.run({
      args: ["apply", "--numstat", "-z", "--", patchFile],
      config: applyConfig,
    });
    if (read.code !== 0) throw unreadable(read.stderr.trim());
    await checkVcsPaths(repository.top, numstatPaths(read.stdout));
    const which = reverse ? ["--reverse"] : [];
    const args = ["apply", "--whitespace=nowarn", ...which, "--", patchFile];
    const applied = await repository.run({ args, config: applyConfig });
    if (applied.code !== 0) throw new Error("The change no longer matches the file.");
  } finally {
    await rm(patchFile, { force: true });
  }
}

/**
 * `git apply` refuses `.git` in every spelling Windows and macOS read as
 * `.git` only where these are on; the port's path rules refuse them too.
 */
const applyConfig: readonly ConfigEntry[] = [
  ["core.protectNTFS", "true"],
  ["core.protectHFS", "true"],
];

/** The header lines of a patch that does more than change a text file's lines. */
const refusedHeaders: readonly string[] = [
  "old mode ",
  "new mode ",
  "rename from ",
  "rename to ",
  "rename old ",
  "rename new ",
  "copy from ",
  "copy to ",
  "similarity index ",
  "dissimilarity index ",
  "GIT binary patch",
  "Binary files ",
];

/** The modes of a plain file: `100755` is one that can run. */
const plainFileModes = new Set(["100644", "100755"]);

/**
 * The paths a patch's headers name, after refusing a patch with any header
 * line that does more than change a text file's lines: a mode change, a
 * rename or a copy, a binary change, and a symbolic link (`120000`), a
 * gitlink (`160000`) or a new file that can run. Lines inside a hunk start
 * with a space, `+`, `-` or `\`, so no hunk line is taken for a header; a
 * line outside a patch that looks like one is refused too, which only
 * refuses more. A NUL, where git would end the path, and a quoted path are
 * refused as well.
 *
 * @throws RangeError naming the line
 */
export function plainTextPatchPaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split("\n")) {
    const refused =
      line.includes("\0") ||
      refusedHeaders.some((header) => line.startsWith(header)) ||
      (line.startsWith("new file mode ") && line !== "new file mode 100644") ||
      (line.startsWith("deleted file mode ") && !plainFileModes.has(line.slice(18))) ||
      (line.startsWith("index ") && !plainFileModes.has(indexLineMode(line)));
    if (refused) throw notPlainText(line);
    const path = headerPath(line);
    if (path === null) continue;
    if (path === undefined) throw notPlainText(line);
    paths.push(path);
  }
  return paths;
}

/**
 * The path a `diff --git`, `---` or `+++` line names, without its `a/` or
 * `b/`; `null` for any other line, or `/dev/null`; `undefined` for a
 * header this adapter refuses: a quoted path, one without the prefix, or a
 * `diff --git` line naming two paths.
 */
function headerPath(line: string): string | null | undefined {
  if (line.startsWith("diff --git ")) {
    const names = line.slice("diff --git ".length);
    // `a/<path> b/<path>`: the same path twice, so its length is known.
    const path = names.slice(2, 2 + (names.length - 5) / 2);
    return names === `a/${path} b/${path}` ? path : undefined;
  }
  if (!line.startsWith("--- ") && !line.startsWith("+++ ")) return null;
  // git adds a tab and a date after the path in some formats.
  const written = line.slice(4).split("\t")[0] as string;
  if (written === "/dev/null") return null;
  const prefix = line.startsWith("---") ? "a/" : "b/";
  return written.startsWith(prefix) ? written.slice(2) : undefined;
}

function notPlainText(line: string): RangeError {
  return new RangeError(
    `The patch can't be applied: it does more than change a text file's lines, or names a path in a way Halonic doesn't read (${JSON.stringify(line)}).`,
  );
}

/** The mode at the end of an `index <old>..<new> <mode>` line; `100644` when it has none. */
function indexLineMode(line: string): string {
  const match = /^index [0-9a-f]+\.\.[0-9a-f]+(?: ([0-7]+))?$/u.exec(line);
  if (match === null) return "";
  return match[1] ?? "100644";
}

/**
 * The paths in `git apply --numstat -z`: `<added>\t<deleted>\t<path>` each.
 * A binary file counts `-`, and a rename has no path there; both are refused.
 */
function numstatPaths(output: Buffer): string[] {
  return nulSeparated(output).map((entry) => {
    const [added, deleted, path] = entry.split("\t");
    if (added === "-" || deleted === "-" || path === undefined || path === "") {
      throw unreadable("a binary change or a rename");
    }
    return path;
  });
}

function unreadable(reason: string): RangeError {
  return new RangeError(`The patch can't be applied: git can't read it as text edits (${reason}).`);
}
