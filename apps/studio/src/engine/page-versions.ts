// The live version of the open workspace, read through the shell's `git` command (HAL-14229), so
// the page's engine starts Run, Run now and routines from it, as the CLI does
// (`app.runs-read-latest-version`). It is the part of the `Vcs` port core's `liveVersionOf`,
// `runSourceFor` and `LiveRoutines` read, and nothing more: it never writes.
//
// Like the CLI's `GitVcs`, it reads regular files only (`ls-tree` modes `100644` and `100755`), so
// a link or a submodule named like an agent's file never loads as one. A folder with no `.git` is
// a workspace with history off, which never needs git, as the CLI's `openGitHistory` says. Where
// there is a `.git` and git can't be found, or the shell won't open it, it refuses: the saved files
// are never read instead, since they may hold changes nobody made live.

import {
  checkCommitId,
  checkPublicWorkspacePath,
  isPrivateWorkspacePath,
  type Vcs,
  type VcsCommit,
  type VcsStatus,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { knownGitProblem, readableProblem } from "../changes/git-reasons.ts";
import type { GitAnswer } from "../changes/workspace-changes.ts";

/** The part of the `Vcs` port the page's engine reads its live version through. */
export type LiveVersions = Pick<Vcs, "status" | "log" | "readAt" | "listAt">;

/** What {@link PageVersions} reads. */
export interface PageVersionsParts {
  /**
   * Runs `git <args>` in the open folder through the shell, which checks the call against its
   * allow-list. Rejects when the shell refuses the call, such as when git isn't there.
   */
  readonly git: (args: readonly string[]) => Promise<GitAnswer>;
  /** Whether the folder has a `.git` entry, which the workspace's files never list. */
  readonly hasGitFolder: () => Promise<boolean>;
}

/** Regular files only: a link (`120000`) or a submodule (`160000`) has no text to read. */
const fileModes = new Set(["100644", "100755"]);

/** A folder that isn't a repository of its own: every other field is empty, as the port says. */
const notARepository: VcsStatus = {
  isRepo: false,
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [],
};

/** The regular files of one commit, listed once. */
interface ListedCommit {
  readonly commit: string;
  readonly files: Promise<ReadonlySet<string>>;
}

/**
 * The open workspace's live version, through the shell's `git`: whether the folder has history,
 * its latest commit, and that commit's files.
 *
 * @example
 * const versions = new PageVersions({ git, hasGitFolder });
 * const live = await liveVersionOf(versions);
 */
export class PageVersions implements LiveVersions {
  readonly #parts: PageVersionsParts;
  /** The files of the last commit read: a start reads one commit many times, then moves on. */
  #listed: ListedCommit | null = null;

  constructor(parts: PageVersionsParts) {
    this.#parts = parts;
  }

  /**
   * Whether the folder is a repository of its own. Only `isRepo` is read, by `liveVersionOf`; the
   * branch and the changes stay empty. A folder inside a larger repository is not one, as the
   * `Vcs` port says.
   *
   * @throws KindedError `unavailable` when the folder has a `.git` and git can't be found, or the
   *   shell or git refuses to open it
   */
  async status(): Promise<VcsStatus> {
    let inside: GitAnswer;
    try {
      inside = await this.#parts.git(["rev-parse", "--is-inside-work-tree"]);
    } catch (error) {
      const kind = refusalKindOf(error);
      if (kind !== "git_not_found" && kind !== "folder_not_opened") throw error;
      // Only a folder without a `.git` has history off. One with its own `.git` whose repository
      // lies outside, such as a git worktree, is refused, so its saved files never run (HAL-16298).
      if (!(await this.#parts.hasGitFolder())) return notARepository;
      throw kind === "git_not_found" ? noGit() : historyOutside();
    }
    // Git refuses a folder owned by someone else with the code of "no repository here".
    const refused = knownGitProblem(inside);
    if (inside.code !== 0 && refused !== null) throw new KindedError("unavailable", refused);
    const isRepo = inside.code === 0 && inside.stdout.trim() === "true";
    return isRepo ? { ...notARepository, isRepo } : notARepository;
  }

  /**
   * At most `limit` commits on the current branch, newest first; none before the first version.
   *
   * @throws RangeError when `limit` isn't a whole number of at least 1
   * @throws KindedError `unavailable` when git can't read the history
   */
  async log(limit: number): Promise<VcsCommit[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`Invalid limit ${limit}: give a whole number of at least 1.`);
    }
    const args = ["log", "-z", "--format=%H%x00%an%x00%aI%x00%s", `--max-count=${limit}`];
    const log = await this.#run(args);
    if (log.code === 0) return parseLog(log.stdout);
    // A repository with no version yet has no log; any other refusal is a real failure.
    const head = await this.#run(["rev-parse", "--verify", "--quiet", "HEAD"]);
    if (head.code !== 0) return [];
    throw new KindedError("unavailable", readableProblem(log));
  }

  /**
   * A regular file's text at `version`, or `null` when the commit has no such regular file.
   *
   * @throws RangeError for a version that isn't a full commit id, or a path the port refuses
   * @throws Error `Unknown version <id>` when the repository has no such commit
   */
  async readAt(version: string, path: string): Promise<string | null> {
    checkCommitId(version);
    checkPublicWorkspacePath(path);
    if (!(await this.#filesAt(version)).has(path)) return null;
    const shown = await this.#run(["show", `${version}:${path}`]);
    if (shown.code !== 0) throw new KindedError("unavailable", readableProblem(shown));
    return shown.stdout;
  }

  /**
   * Every regular file under `dir` at `version` (the whole workspace without one), sorted,
   * private entries left out; `null` when there is none.
   *
   * @throws as {@link PageVersions.readAt}
   */
  async listAt(version: string, dir?: string): Promise<string[] | null> {
    checkCommitId(version);
    if (dir !== undefined) checkPublicWorkspacePath(dir);
    const paths = [...(await this.#filesAt(version))]
      .filter((path) => dir === undefined || path.startsWith(`${dir}/`))
      .filter((path) => !isPrivateWorkspacePath(path))
      .sort();
    return paths.length === 0 ? null : paths;
  }

  /** The regular files of `version`, listed once while it is the commit being read. */
  #filesAt(version: string): Promise<ReadonlySet<string>> {
    const kept = this.#listed;
    if (kept?.commit === version) return kept.files;
    const files = this.#listFiles(version);
    const listed = { commit: version, files };
    this.#listed = listed;
    // A failed listing is not kept, so the next read tries again.
    files.catch(() => {
      if (this.#listed === listed) this.#listed = null;
    });
    return files;
  }

  async #listFiles(version: string): Promise<ReadonlySet<string>> {
    const listed = await this.#run(["ls-tree", "-r", "-z", version]);
    if (listed.code !== 0) {
      const known = await this.#run(["rev-parse", "--verify", "--quiet", `${version}^{commit}`]);
      if (known.code !== 0) throw new Error(`Unknown version ${version}`);
      throw new KindedError("unavailable", readableProblem(listed));
    }
    return regularFilesOf(listed.stdout);
  }

  /** Runs git, with "git isn't on this computer" said as the page says it. */
  async #run(args: readonly string[]): Promise<GitAnswer> {
    try {
      return await this.#parts.git(args);
    } catch (error) {
      if (refusalKindOf(error) === "git_not_found") throw noGit();
      throw error;
    }
  }
}

/**
 * The regular files in `ls-tree -r -z` output: `<mode> <type> <id>\t<path>` entries, each ended by
 * NUL. The path may hold spaces, never a tab before it.
 */
function regularFilesOf(output: string): Set<string> {
  const files = new Set<string>();
  for (const entry of output.split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab === -1) continue;
    const [mode, type] = entry.slice(0, tab).split(" ");
    if (type === "blob" && mode !== undefined && fileModes.has(mode)) {
      files.add(entry.slice(tab + 1));
    }
  }
  return files;
}

/** Reads the log's output: four NUL-separated fields per commit. */
function parseLog(output: string): VcsCommit[] {
  if (output === "") return [];
  const fields = output.split("\0");
  const commits: VcsCommit[] = [];
  for (let at = 0; at + 3 < fields.length; at += 4) {
    commits.push({
      hash: fields[at] ?? "",
      author: fields[at + 1] ?? "",
      date: new Date(fields[at + 2] ?? "").toISOString(),
      message: fields[at + 3] ?? "",
    });
  }
  return commits;
}

/** The kind of a shell's refusal (`GitRefusal.kind`), or `null` for any other failure. */
function refusalKindOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("kind" in error)) return null;
  return typeof error.kind === "string" ? error.kind : null;
}

/** The workspace has history, and git can't be found on this computer to read it. */
export class GitMissingError extends KindedError {
  constructor() {
    super("unavailable", "git isn't on this computer.");
  }
}

function noGit(): GitMissingError {
  return new GitMissingError();
}

/**
 * The folder has its own `.git`, and the shell won't open the repository it leads to. The fix names
 * both ways on: the repository's own folder, which the shell opens, and the CLI, which reads the
 * live version there (HAL-16683).
 */
function historyOutside(): KindedError {
  return new KindedError(
    "unavailable",
    "This folder's history lies outside the folder you opened, so it can't be read.",
    {
      fix: "Open the folder that holds the repository instead, or run it with halonic in a terminal.",
    },
  );
}
