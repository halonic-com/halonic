import type { DefinitionStore } from "@halonicjs/ports";
import {
  isPrivateWorkspacePath,
  parseStatus,
  unversionedFolders,
  type VcsChange,
} from "@halonicjs/ports";
import { contentDigest, KindedError, type Sha256 } from "@halonicjs/std";
import type {
  ChangesRead,
  ChangesSource,
  FileTexts,
  Identity,
  KeptFile,
  MergeStart,
  ReplaceResult,
  UpdateChoice,
  UpdateMerge,
  UpdatesResult,
  Version,
  VersionInput,
} from "@halonicjs/studio-feature-source-control/api";
import { wakeOn } from "./changes-wakes.ts";
import {
  addressReason,
  gitReason,
  identityReason,
  knownGitProblem,
  readableProblem,
  shareReason,
  updatesReason,
} from "./git-reasons.ts";
import { historyArgs, versionsFromLog } from "./history-log.ts";
import { lastVersionDiffArgs, lastVersionFromDiff } from "./last-version.ts";
import { SharedCopy } from "./shared-copy.ts";
import { statusArgs } from "./status-args.ts";
import { ignoreStudioFolder } from "./studio-ignore.ts";
import { filesChangedSince, readFileAtVersion } from "./version-file.ts";
import { type ChoicesMemory, UpdatesMerge } from "./workspace-merge.ts";

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
  /** Where a half-done Get updates keeps what was chosen. */
  readonly choices: ChoicesMemory;
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

/** The most versions counted for Share or Get updates; a bigger count reads as this many. */
const versionCountCap = 1000;

/**
 * The open workspace's history, read through the shell's `git` command: what changed since the
 * last version, and turning history on for a folder that has none (requirement
 * `source-control.changes-page`).
 */
export class WorkspaceChanges implements ChangesSource {
  readonly #options: WorkspaceChangesOptions;
  readonly #merge: UpdatesMerge;
  readonly #sharedCopy: SharedCopy;
  /** Whether the last read found a repository and git; true until a read says otherwise. */
  #repository = true;

  constructor(options: WorkspaceChangesOptions) {
    this.#options = options;
    this.#sharedCopy = new SharedCopy({
      run: (args) => this.#run(args),
      remoteName: shareRemoteName,
      countCap: versionCountCap,
      reason: readableProblem,
    });
    this.#merge = new UpdatesMerge({
      run: async (args) => {
        const answer = await this.#run(args);
        if (answer === "no-git")
          throw new KindedError("unavailable", "git isn't on this computer.");
        return answer;
      },
      reason: (answer, doing) => (doing === "get" ? updatesReason(answer) : gitReason(answer)),
      files: options.files,
      choices: options.choices,
      replaceFile: (path, text, expected) => this.replaceFile(path, text, expected),
      removeFile: (path, expected) => this.removeFile(path, expected),
      changedPaths: async () => {
        const read = await this.read();
        return new Set(
          read.kind === "ready"
            ? read.changes.flatMap((change) =>
                change.from === undefined ? [change.path] : [change.path, change.from],
              )
            : [],
        );
      },
      isPrivate: (path) => isUnversionedPath(path) || isPrivateWorkspacePath(path),
    });
  }

  async read(): Promise<ChangesRead> {
    const read = await this.#read();
    this.#repository = read.kind === "ready";
    return read;
  }

  async #read(): Promise<ChangesRead> {
    let inside: GitAnswer | "no-git";
    try {
      inside = await this.#run(["rev-parse", "--is-inside-work-tree"]);
    } catch (error) {
      if (isFolderNotOpened(error)) return { kind: "nested-repository" };
      throw error;
    }
    if (inside === "no-git") return { kind: "no-git" };
    // Git refuses a folder owned by someone else with the same exit code as "no repository here";
    // saying "turn on history" for it would be wrong.
    const refused = knownGitProblem(inside);
    if (inside.code !== 0 && refused !== null) throw new KindedError("unavailable", refused);
    if (inside.code !== 0 || inside.stdout.trim() !== "true") return { kind: "not-a-repository" };
    const status = await this.#run(statusArgs);
    if (status === "no-git") return { kind: "no-git" };
    if (status.code !== 0) throw new KindedError("unavailable", readableProblem(status));
    const changes = parseStatus(status.stdout).changes.filter(isVersioned);
    return { kind: "ready", changes: await this.#merge.ownChanges(changes) };
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

  async readFile(path: string): Promise<string | null> {
    return this.#options.files.read(path);
  }

  async readAtVersion(versionId: string, path: string): Promise<string | null> {
    return readFileAtVersion((args) => this.#run(args), readableProblem, versionId, path);
  }

  async listChangedSince(versionId: string): Promise<readonly string[]> {
    const keep = (path: string) => !isUnversionedPath(path);
    return filesChangedSince((args) => this.#run(args), readableProblem, versionId, keep);
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
    await ignoreStudioFolder(this.#options.files);
    let init: GitAnswer | "no-git";
    try {
      init = await this.#run(["init", "--quiet"]);
    } catch (error) {
      // Nothing was made: the list reads again, and the read says the folder is inside a larger
      // repository, since the shell refuses `rev-parse` there the same way.
      if (isFolderNotOpened(error)) return;
      throw error;
    }
    if (init === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (init.code !== 0) throw new KindedError("unavailable", readableProblem(init));
  }

  async readIdentity(): Promise<Identity> {
    return {
      name: await this.#readSetting("user.name"),
      email: await this.#readSetting("user.email"),
    };
  }

  async setIdentity({ name, email }: Identity): Promise<void> {
    for (const [key, value] of [
      ["user.name", name],
      ["user.email", email],
    ] as const) {
      const set = await this.#run(["config", key, value]);
      if (set === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
      if (set.code !== 0) throw new KindedError("unavailable", identityReason(set));
    }
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

  async countUnshared(): Promise<number> {
    const range = await this.#sharedCopy.unsharedRange();
    return range === null ? 0 : this.#sharedCopy.count(range);
  }

  async listUnshared(): Promise<readonly string[]> {
    const range = await this.#sharedCopy.unsharedRange();
    return range === null ? [] : this.#sharedCopy.idsInFolder(range);
  }

  async checkUpdates(): Promise<number> {
    const fetch = await this.#run(["fetch", "--quiet", "--no-tags", shareRemoteName]);
    if (fetch === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (fetch.code !== 0) throw new KindedError("unavailable", updatesReason(fetch));
    const shared = await this.#sharedCopy.ref();
    if (shared === null) return 0;
    return this.#sharedCopy.count((await this.#head()) === null ? shared : `HEAD..${shared}`);
  }

  async share(): Promise<void> {
    const push = await this.#run(["push", "--quiet", "--set-upstream", shareRemoteName, "HEAD"]);
    if (push === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (push.code !== 0) throw new KindedError("unavailable", shareReason(push));
  }

  async getUpdates(): Promise<UpdatesResult> {
    const before = await this.#head();
    const from = await this.#sharedCopy.pullSource();
    const pull = await this.#run(["pull", "--ff-only", "--quiet", ...from]);
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
    // One line per version, with who recorded it; git lists the newest first.
    const log = await this.#run(["log", "--format=%an", range]);
    if (log === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (log.code !== 0) throw new KindedError("unavailable", readableProblem(log));
    const names = log.stdout.split("\n").filter((name) => name.trim() !== "");
    return { kind: "got", count: names.length, people: [...new Set(names.reverse())] };
  }

  startMerge(): Promise<MergeStart> {
    return this.#merge.start();
  }

  readMerge(): Promise<UpdateMerge | null> {
    return this.#merge.read();
  }

  chooseUpdate(path: string, choice: UpdateChoice, label: string): Promise<void> {
    return this.#merge.choose(path, choice, label);
  }

  undoUpdateChoice(path: string): Promise<void> {
    return this.#merge.undo(path);
  }

  finishMerge(message: string): Promise<void> {
    return this.#merge.finish(message);
  }

  cancelMerge(): Promise<void> {
    return this.#merge.cancel();
  }

  subscribe(listener: () => void): () => void {
    return wakeOn(this.#options, () => this.#repository, listener);
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

  /** One setting as git would use it; empty when it isn't set (git answers 1 for that). */
  async #readSetting(key: "user.name" | "user.email"): Promise<string> {
    const found = await this.#run(["config", "--get", key]);
    if (found === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    return found.code === 0 ? found.stdout.trim() : "";
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
}

/** Whether the shell refused because it found no git program (`GitRefusal.kind`). */
function isGitNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "kind" in error && error.kind === "git_not_found"
  );
}

/**
 * Whether the shell refused because the repository's top is outside the opened folder: a
 * workspace folder inside a larger repository (`GitRefusal.kind`).
 */
function isFolderNotOpened(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    error.kind === "folder_not_opened"
  );
}

/** Files in Halonic's own folders, such as review records, aren't versions of the workspace. */
function isVersioned(change: VcsChange): boolean {
  return !isUnversionedPath(change.path);
}

function isUnversionedPath(path: string): boolean {
  return unversionedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}
