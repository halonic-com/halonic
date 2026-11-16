import type { DefinitionStore } from "@halonicjs/ports";
import { parseStatus, unversionedFolders, type VcsChange } from "@halonicjs/ports";
import { contentDigest, KindedError, type Sha256 } from "@halonicjs/std";
import type {
  ChangesRead,
  ChangesSource,
  FileTexts,
  KeptFile,
  ReplaceResult,
  UpdatesResult,
  Version,
  VersionInput,
} from "@halonicjs/studio-feature-source-control/api";
import { historyArgs, versionsFromLog } from "./history-log.ts";
import { lastVersionDiffArgs, lastVersionFromDiff } from "./last-version.ts";
import { statusArgs } from "./status-args.ts";

/** What git said, as the shell's `git` command gives it back. */
export interface GitAnswer {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** What {@link WorkspaceChanges} reads and writes. */
export interface WorkspaceChangesOptions {
  /**
   * Runs `git <args>` in the open folder through the shell, which checks the call against its
   * allow-list. Rejects when the shell refuses the call or git isn't there.
   */
  readonly git: (args: readonly string[]) => Promise<GitAnswer>;
  /** The folder's files, for `.gitignore`. */
  readonly files: Pick<DefinitionStore, "read" | "write" | "remove">;
  /**
   * Where a discard keeps its copies, a folder of its own: the folder's files refuse `.studio`.
   * Every path given to it is relative to that folder.
   */
  readonly copies: Pick<DefinitionStore, "write">;
  /** Hashes a file's text for the write-if-unchanged check. */
  readonly digest: Sha256;
  /** Calls its listener when the window comes to the front; returns a function that stops it. */
  readonly onFocus: (listener: () => void) => () => void;
  /** Calls its listener when a file of the workspace changed; returns a function that stops it. */
  readonly onFilesChanged: (listener: () => void) => () => void;
  /** The time, for the name of a kept copy; the system clock when left out. */
  readonly now?: () => Date;
}

/** What the share address is called in git: the name git itself gives the place a clone came from. */
const shareRemoteName = "origin";

/** The line that keeps Halonic's own data out of the history. */
const studioIgnoreLine = ".studio/";

/**
 * The open workspace's history, read through the shell's `git` command: what changed since the
 * last version, and turning history on for a folder that has none (requirement
 * `source-control.changes-page`).
 */
export class WorkspaceChanges implements ChangesSource {
  readonly #options: WorkspaceChangesOptions;

  constructor(options: WorkspaceChangesOptions) {
    this.#options = options;
  }

  async read(): Promise<ChangesRead> {
    const inside = await this.#run(["rev-parse", "--is-inside-work-tree"]);
    if (inside === "no-git") return { kind: "no-git" };
    // Git refuses a folder owned by someone else with the same exit code as "no repository here";
    // saying "turn on history" for it would be wrong.
    const refused = knownGitProblem(inside);
    if (inside.code !== 0 && refused !== null) throw new KindedError("unavailable", refused);
    if (inside.code !== 0 || inside.stdout.trim() !== "true") return { kind: "not-a-repository" };
    const status = await this.#run(statusArgs);
    if (status === "no-git") return { kind: "no-git" };
    if (status.code !== 0) throw new KindedError("unavailable", readableProblem(status));
    return { kind: "ready", changes: parseStatus(status.stdout).changes.filter(isVersioned) };
  }

  async readTexts(change: VcsChange): Promise<FileTexts> {
    const after = change.status === "deleted" ? null : await this.#options.files.read(change.path);
    return { before: await this.#lastVersionOf(change, after), after };
  }

  async replaceFile(path: string, text: string, expected: string | null): Promise<ReplaceResult> {
    const result = await this.#options.files.write(path, text, {
      expected: expected === null ? "absent" : await contentDigest(expected, this.#options.digest),
    });
    return result.status === "written" ? "replaced" : "changed-on-disk";
  }

  async removeFile(path: string, expected: string): Promise<ReplaceResult> {
    const result = await this.#options.files.remove(path, {
      expected: await contentDigest(expected, this.#options.digest),
    });
    return result.status === "removed" ? "replaced" : "changed-on-disk";
  }

  async keepCopy(files: readonly KeptFile[]): Promise<void> {
    const stamp = (this.#options.now?.() ?? new Date()).toISOString().replaceAll(":", "-");
    for (const file of files) {
      await this.#options.copies.write(`${stamp}/${file.path}`, file.text);
    }
  }

  async readHistory(limit: number): Promise<readonly Version[]> {
    const log = await this.#run(historyArgs(limit));
    if (log === "no-git") return [];
    if (log.code !== 0) {
      // A repository with no version yet has no log; any other refusal is a real failure.
      const head = await this.#run(["rev-parse", "--verify", "--quiet", "HEAD"]);
      if (head === "no-git" || head.code !== 0) return [];
      throw new KindedError("unavailable", readableProblem(log));
    }
    return versionsFromLog(log.stdout, (path) => !isUnversionedPath(path));
  }

  async createVersion({ message, paths }: VersionInput): Promise<void> {
    // `commit -- <paths>` takes tracked, renamed and deleted files by itself; only the new files
    // need adding, and `git add` refuses a path that is neither in the index nor on disk.
    const others = await this.#run([
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      "--",
      ...paths,
    ]);
    if (others === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (others.code !== 0) throw new KindedError("unavailable", gitReason(others));
    const untracked = others.stdout.split("\0").filter((path) => path !== "");
    if (untracked.length > 0) {
      const add = await this.#run(["add", "--", ...untracked]);
      if (add === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
      if (add.code !== 0) throw new KindedError("unavailable", gitReason(add));
    }
    const commit = await this.#run(["commit", "-m", message, "--", ...paths]);
    if (commit === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (commit.code !== 0) throw new KindedError("unavailable", gitReason(commit));
  }

  async turnOnHistory(): Promise<void> {
    // The ignore line first, so a failed init never leaves `.studio/` showing up as changed.
    await this.#ignoreStudioFolder();
    const init = await this.#run(["init", "--quiet"]);
    if (init === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (init.code !== 0) throw new KindedError("unavailable", readableProblem(init));
  }

  async hasRemote(): Promise<boolean> {
    const remotes = await this.#run(["remote"]);
    return remotes !== "no-git" && remotes.code === 0 && remotes.stdout.trim() !== "";
  }

  async addRemote(address: string): Promise<void> {
    const add = await this.#run(["remote", "add", shareRemoteName, address]);
    if (add === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (add.code !== 0) throw new KindedError("unavailable", addressReason(add));
  }

  async getUpdates(): Promise<UpdatesResult> {
    const before = await this.#head();
    const pull = await this.#run(["pull", "--ff-only", "--quiet"]);
    if (pull === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (pull.code !== 0) {
      if (
        /not possible to fast-forward|divergent branches/i.test(`${pull.stderr}\n${pull.stdout}`)
      ) {
        return { kind: "both-moved" };
      }
      throw new KindedError("unavailable", updatesReason(pull));
    }
    const after = await this.#head();
    if (after === before) return { kind: "up-to-date" };
    const range = before === null ? "HEAD" : `${before}..HEAD`;
    const log = await this.#run(["log", "--oneline", range]);
    if (log === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (log.code !== 0) throw new KindedError("unavailable", readableProblem(log));
    return {
      kind: "got",
      count: log.stdout.split("\n").filter((line) => line.trim() !== "").length,
    };
  }

  subscribe(listener: () => void): () => void {
    const stops = [this.#options.onFocus(listener), this.#options.onFilesChanged(listener)];
    return () => {
      for (const stop of stops) stop();
    };
  }

  /**
   * The file as the last version has it, `null` for a file that wasn't there. A repository with no
   * version yet has none of its files.
   */
  async #lastVersionOf(change: VcsChange, after: string | null): Promise<string | null> {
    if (change.status === "untracked") return null;
    const diff = await this.#run(lastVersionDiffArgs(change.from ?? change.path));
    if (diff === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (diff.code !== 0) {
      const head = await this.#run(["rev-parse", "--verify", "--quiet", "HEAD"]);
      if (head !== "no-git" && head.code !== 0) return null;
      throw new KindedError("unavailable", readableProblem(diff));
    }
    return lastVersionFromDiff(diff.stdout, after);
  }

  /** The commit the folder is on, `null` before its first version. */
  async #head(): Promise<string | null> {
    const head = await this.#run(["rev-parse", "--verify", "--quiet", "HEAD"]);
    if (head === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    return head.code === 0 ? head.stdout.trim() : null;
  }

  /** Runs git; `"no-git"` when the shell says the git program isn't found. */
  async #run(args: readonly string[]): Promise<GitAnswer | "no-git"> {
    try {
      return await this.#options.git(args);
    } catch (error) {
      if (isGitNotFound(error)) return "no-git";
      throw error;
    }
  }

  async #ignoreStudioFolder(): Promise<void> {
    const current = await this.#options.files.read(".gitignore");
    if (current !== null && ignoresStudio(current)) return;
    const separator = current === null || current === "" || current.endsWith("\n") ? "" : "\n";
    const text = `${current ?? ""}${separator}${studioIgnoreLine}\n`;
    // A file that is there is added to without a check: the line is only added, and git ignores
    // a repeated one. A new file must not appear in between.
    const result =
      current === null
        ? await this.#options.files.write(".gitignore", text, { expected: "absent" })
        : await this.#options.files.write(".gitignore", text);
    if (result.status === "changed-on-disk") {
      throw new KindedError(
        "conflict",
        ".gitignore changed while Halonic was changing it. Try again.",
      );
    }
  }
}

/** The first non-empty line of what git said: its own message is never shown as raw output. */
function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

/** A plain sentence for the git failures people meet most, `null` for any other. */
function knownGitProblem(answer: GitAnswer): string | null {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/dubious ownership|safe\.directory/i.test(said)) {
    return "Git won't open this workspace because another user owns its folder. Run git config --global --add safe.directory with the path of the folder git names to allow it, then try again.";
  }
  if (/index\.lock|another git process/i.test(said)) {
    return "Another program is using this workspace's history right now. Wait a moment, then try again.";
  }
  if (/permission denied|operation not permitted|read-only file system/i.test(said)) {
    return "Git can't read or change this workspace's history. Check that you have permission to the folder.";
  }
  return null;
}

/** Why a read of the history failed: a plain sentence when known, otherwise git's first line. */
function readableProblem(answer: GitAnswer): string {
  return knownGitProblem(answer) ?? firstLine(answer.stderr);
}

/** Why a version couldn't be created, as one plain sentence: git's own output is never shown. */
function gitReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/tell me who you are|empty ident name|author identity unknown/i.test(said)) {
    return "Git doesn't know who versions should be from. Set your name and email in git, then try again.";
  }
  if (/nothing (added )?to commit|no changes added/i.test(said)) {
    return "There is nothing to record: these changes are already in a version.";
  }
  if (/hook|permission denied|operation not permitted|read-only/i.test(said)) {
    return "Git refused to record the version. A check on this workspace or a permission stopped it.";
  }
  return knownGitProblem(answer) ?? "Git didn't accept the version.";
}

/** Why a share address couldn't be added, as one plain sentence: git's own output is never shown. */
function addressReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/already exists/i.test(said)) return "This workspace already has a place to share to.";
  return knownGitProblem(answer) ?? "Git didn't accept this address.";
}

/** Why getting updates failed, as one plain sentence: git's own output is never shown. */
function updatesReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (
    /no tracking information|no upstream|no such remote|does not appear to be a git repository/i.test(
      said,
    )
  ) {
    return "This workspace isn't set up to get updates yet.";
  }
  if (
    /could not resolve host|unable to access|could not read from remote|connection (refused|timed out)|network is unreachable/i.test(
      said,
    )
  ) {
    return "you can't reach the shared copy right now.";
  }
  if (/authentication failed|permission denied \(publickey\)|could not read username/i.test(said)) {
    return "the shared copy didn't accept your sign-in.";
  }
  if (/would be overwritten/i.test(said)) {
    return "updates would overwrite changes you haven't put in a version. Create a version first.";
  }
  return knownGitProblem(answer) ?? "Git didn't get the updates.";
}

/** Whether the shell refused because it found no git program (`GitRefusal.kind`). */
function isGitNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "kind" in error && error.kind === "git_not_found"
  );
}

/** Whether a `.gitignore` already lists the `.studio` folder. */
function ignoresStudio(text: string): boolean {
  return text
    .split("\n")
    .some((line) => [".studio", ".studio/", "/.studio", "/.studio/"].includes(line.trim()));
}

/** Files in Halonic's own folders, such as review records, aren't versions of the workspace. */
function isVersioned(change: VcsChange): boolean {
  return !isUnversionedPath(change.path);
}

function isUnversionedPath(path: string): boolean {
  return unversionedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}
