import { randomUUID } from "node:crypto";
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { checkCommitId, checkPublicWorkspacePath, isPrivateWorkspacePath } from "@halonicjs/ports";
import type { ConfigEntry } from "./hardening.ts";
import { inPathBatches } from "./path-batches.ts";
import type { Repository } from "./repository.ts";

/**
 * Commits every public file on disk, new ones included and ignored ones
 * left out, on top of the current commit, and gives the commit's id. It
 * works on a copy of the index in `.git`, so the index, HEAD and the branch
 * don't change, and the commit is on no branch.
 *
 * @param author - config naming the author and committer
 */
export async function snapshotCommit(
  repository: Repository,
  author: readonly ConfigEntry[],
): Promise<string> {
  const indexFile = join(repository.gitDir, `halonic-snapshot-${randomUUID()}.index`);
  try {
    // Without an index yet, git starts the copy empty.
    await copyFile(join(repository.gitDir, "index"), indexFile).catch(ignoreMissing);
    const onCopy = (args: readonly string[]): Promise<Buffer> =>
      repository.output({ args, indexFile });
    await onCopy(["add", "--all", "--", "."]);
    // `.env` and the other private entries stay out even when `.gitignore` lets them in.
    const leftOut = nulSeparated(await onCopy(["ls-files", "-z"])).filter(isPrivateWorkspacePath);
    await inPathBatches(leftOut, (batch) => onCopy(["rm", "--cached", "--quiet", "--", ...batch]));
    const tree = text(await onCopy(["write-tree"]));
    const parent = await currentCommit(repository);
    const parents = parent === null ? [] : ["-p", parent];
    const args = ["commit-tree", ...parents, "-m", "Snapshot", tree];
    return text(await repository.output({ args, config: author }));
  } finally {
    await rm(indexFile, { force: true });
  }
}

/**
 * A file's text at a commit, or `null` when the commit has no such file.
 * It checks the version and the path before it opens the repository, so a
 * refused input never runs git.
 *
 * @param open - opens the repository, which runs git to check it
 * @throws RangeError for a version that isn't a full commit id, a full id that
 *   names a tree or a file rather than a commit, or a path the port refuses
 * @throws Error `Unknown version <id>` when the repository has no such commit
 */
export async function readAtCommit(
  open: () => Promise<Repository>,
  version: string,
  path: string,
): Promise<string | null> {
  checkCommitId(version);
  checkPublicWorkspacePath(path);
  const repository = await open();
  await checkKnownVersion(repository, version);
  const entry = (await filesAt(repository, version, path)).find((file) => file.path === path);
  if (entry === undefined) return null;
  // `cat-file blob` gives the stored bytes: no filter or textconv runs.
  return (await repository.output({ args: ["cat-file", "blob", entry.id] })).toString("utf8");
}

/**
 * Every public file under `dir` at a commit (the whole tree without one),
 * as sorted paths, or `null` when there is none. Like {@link readAtCommit},
 * it checks its input before it opens the repository.
 *
 * @throws as {@link readAtCommit}
 */
export async function listAtCommit(
  open: () => Promise<Repository>,
  version: string,
  dir?: string,
): Promise<string[] | null> {
  checkCommitId(version);
  if (dir !== undefined) checkPublicWorkspacePath(dir);
  const repository = await open();
  await checkKnownVersion(repository, version);
  const paths = (await filesAt(repository, version, dir))
    .map((file) => file.path)
    .filter((path) => dir === undefined || path.startsWith(`${dir}/`))
    .filter((path) => !isPrivateWorkspacePath(path))
    .sort();
  return paths.length === 0 ? null : paths;
}

/** One file in a commit's tree. */
interface TreeFile {
  path: string;
  /** The blob's id. */
  id: string;
}

/** Regular files only: a link (`120000`) or a submodule (`160000`) has no text to read. */
const fileModes = new Set(["100644", "100755"]);

/** The regular files of the commit's tree, under `path` when given. */
async function filesAt(
  repository: Repository,
  version: string,
  path?: string,
): Promise<TreeFile[]> {
  const args = ["ls-tree", "-r", "-z", version, ...(path === undefined ? [] : ["--", path])];
  const files: TreeFile[] = [];
  for (const line of nulSeparated(await repository.output({ args }))) {
    // `<mode> <type> <id>\t<path>`; the path may hold spaces, never a tab before it.
    const tab = line.indexOf("\t");
    const [mode, type, id] = line.slice(0, tab).split(" ");
    if (type === "blob" && mode !== undefined && fileModes.has(mode) && id !== undefined) {
      files.push({ path: line.slice(tab + 1), id });
    }
  }
  return files;
}

/**
 * Refuses a version the repository doesn't have, and a full id that names
 * something other than a commit. Run it after `checkCommitId`.
 *
 * @throws as {@link readAtCommit}
 */
export async function checkKnownVersion(repository: Repository, version: string): Promise<void> {
  const found = await repository.run({ args: ["cat-file", "-t", version] });
  if (found.code !== 0) throw new Error(`Unknown version ${version}`);
  // A full id may name a tree, a file or a tag; only a commit is a version.
  const type = text(found.stdout);
  if (type !== "commit")
    throw new RangeError(`Invalid version ${version}: it names a ${type}, not a commit.`);
}

async function currentCommit(repository: Repository): Promise<string | null> {
  const result = await repository.run({ args: ["rev-parse", "--verify", "--quiet", "HEAD"] });
  return result.code === 0 ? text(result.stdout) : null;
}

/** The entries of `-z` output, such as paths. */
export function nulSeparated(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry !== "");
}

/** One line of output, such as an id. */
function text(output: Buffer): string {
  return output.toString("utf8").trim();
}

function ignoreMissing(error: unknown): void {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
