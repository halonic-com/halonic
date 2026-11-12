import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitResult, GitRunner } from "./git-runner.ts";

// A clean export of one commit of a remote repository: its files and
// nothing else. No `.git` folder is made in the destination, so nothing
// the repository carries (config, hooks, attributes) can be read later.

/** What an export gave back. */
export interface GitExport {
  /** The full id of the commit whose files are in the folder. */
  commit: string;
  /**
   * The remote's default branch, which was exported, when no ref was named
   * and the remote says which branch its `HEAD` is; `undefined` otherwise.
   */
  branch: string | undefined;
}

/** The refs a caller may name: no option, no revision syntax, nothing git would read as a range or a path. */
const plainRef = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function isPlainRef(ref: string): boolean {
  return plainRef.test(ref) && !ref.includes("..") && !ref.includes("//") && !/[./]$/.test(ref);
}

/** A full commit id: 40 hex digits, or 64 with SHA-256. */
const fullCommitId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Refuses a git address that is not an `https://` or `ssh://` one, that
 * starts with `-` (git would read it as an option), that names a
 * transport such as `ext::`, or that carries a password.
 *
 * @throws Error saying which rule the address broke, never echoing a password
 */
export function checkGitAddress(address: string): void {
  if (address.startsWith("-")) throw refused("it starts with -, which git reads as an option");
  if (hasSpaceOrControl(address)) {
    throw refused("it has a space or a control character in it");
  }
  const url = parseAddress(address);
  if (url === null || (url.protocol !== "https:" && url.protocol !== "ssh:")) {
    throw refused("only https:// and ssh:// addresses are allowed");
  }
  if (url.password !== "") throw refused("it has a password in it; use a key or a token instead");
  if (url.hostname === "" || url.hostname.startsWith("-")) throw refused("its host is not valid");
}

/**
 * Refuses what {@link exportCommit} would refuse before it starts git: an
 * address {@link checkGitAddress} refuses, or a `ref` that isn't a plain
 * branch, tag or commit id, such as an option or a range. A caller can run
 * it before it even looks for git.
 *
 * @throws Error saying what was refused
 */
export function checkGitExport(address: string, ref = "HEAD"): void {
  checkGitAddress(address);
  if (ref !== "HEAD" && !isPlainRef(ref)) {
    throw new Error(`Can't use "${ref}" as a commit: use a branch, a tag or a full commit id.`);
  }
}

function hasSpaceOrControl(text: string): boolean {
  return [...text].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x20 || code === 0x7f || /\s/u.test(character);
  });
}

function parseAddress(address: string): URL | null {
  try {
    return new URL(address);
  } catch {
    return null;
  }
}

function refused(reason: string): Error {
  return new Error(`Can't use that git address: ${reason}.`);
}

/**
 * Puts the files of one commit of the repository at `address` into the
 * empty folder `destination`. `ref` is a branch, a tag or a full commit
 * id, and the remote's `HEAD` by default, whose branch is then looked up
 * first and fetched by name; either way, the commit is resolved to its
 * full id before anything is written. Only that commit is
 * fetched (depth 1), submodules are not, and links stay links for the
 * reader that checks the files to refuse.
 *
 * @throws Error when the address or ref is refused, the fetch fails, the ref doesn't resolve to a full commit id, or a `.git` ends up in the folder
 */
export async function exportCommit(
  runner: GitRunner,
  address: string,
  destination: string,
  ref = "HEAD",
): Promise<GitExport> {
  checkGitExport(address, ref);
  const work = await mkdtemp(join(tmpdir(), "halonic-git-export-"));
  try {
    const gitDir = join(work, "repository");
    const git = (args: readonly string[], network = false) =>
      runner.run({
        cwd: work,
        args: [`--git-dir=${gitDir}`, `--work-tree=${work}`, ...args],
        network,
        indexFile: join(work, "index"),
      });
    await mustSucceed(
      await runner.run({
        cwd: work,
        args: ["init", "--quiet", "--bare", "--template=", "--", gitDir],
      }),
      "set up",
    );
    const branch = ref === "HEAD" ? await remoteHeadBranch(git, address) : undefined;
    await mustSucceed(
      await git(
        [
          "fetch",
          "--quiet",
          "--depth=1",
          "--no-tags",
          "--no-recurse-submodules",
          "--upload-pack=git-upload-pack",
          "--",
          address,
          branch ?? ref,
        ],
        true,
      ),
      "fetch the commit",
    );
    const resolved = await git(["rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}"]);
    await mustSucceed(resolved, "find the commit");
    const commit = resolved.stdout.toString("utf8").trim();
    if (!fullCommitId.test(commit)) throw new Error(`git gave "${commit}", not a full commit id.`);
    await mustSucceed(await git(["read-tree", commit]), "read the commit");
    await mkdir(destination, { recursive: true });
    await mustSucceed(
      await git(["checkout-index", "--all", `--prefix=${join(destination, "/")}`]),
      "write the files",
    );
    await checkNoGitFolder(destination);
    return { commit, branch };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** A git call in the export's own folder, as `exportCommit` makes it. */
type ExportGit = (args: readonly string[], network?: boolean) => Promise<GitResult>;

/**
 * The branch the remote's `HEAD` points at, such as `main`, or `undefined`
 * when the remote doesn't say or names one a caller couldn't name itself.
 */
async function remoteHeadBranch(git: ExportGit, address: string): Promise<string | undefined> {
  const listed = await git(["ls-remote", "--symref", "--", address, "HEAD"], true);
  await mustSucceed(listed, "reach the repository");
  const head = /^ref: refs\/heads\/(\S+)\tHEAD$/mu.exec(listed.stdout.toString("utf8"));
  const branch = head?.[1];
  return branch !== undefined && isPlainRef(branch) ? branch : undefined;
}

async function mustSucceed(
  result: { code: number | null; stderr: string },
  step: string,
): Promise<void> {
  if (result.code === 0) return;
  throw new Error(`Couldn't ${step}: ${result.stderr.trim()}`);
}

async function checkNoGitFolder(destination: string): Promise<void> {
  try {
    await lstat(join(destination, ".git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("The export has a .git in it, which Halonic doesn't allow.");
}
