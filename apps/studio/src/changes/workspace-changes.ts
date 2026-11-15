import type { DefinitionStore } from "@halonicjs/ports";
import { unversionedFolders, type VcsChange } from "@halonicjs/ports";
import { contentDigest, KindedError, type Sha256 } from "@halonicjs/std";
import type {
  ChangesRead,
  ChangesSource,
  FileTexts,
  ReplaceResult,
  VersionInput,
} from "@halonicjs/studio-feature-source-control/api";
import { lastVersionDiffArgs, lastVersionFromDiff } from "./last-version.ts";
import { parseStatus, statusArgs } from "./parse-status.ts";

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
  readonly files: Pick<DefinitionStore, "read" | "write">;
  /** Hashes a file's text for the write-if-unchanged check. */
  readonly digest: Sha256;
  /** Calls its listener when the window comes to the front; returns a function that stops it. */
  readonly onFocus: (listener: () => void) => () => void;
  /** Calls its listener when a file of the workspace changed; returns a function that stops it. */
  readonly onFilesChanged: (listener: () => void) => () => void;
}

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
    if (inside.code !== 0 || inside.stdout.trim() !== "true") return { kind: "not-a-repository" };
    const status = await this.#run(statusArgs);
    if (status === "no-git") return { kind: "no-git" };
    if (status.code !== 0) throw new KindedError("unavailable", firstLine(status.stderr));
    return { kind: "ready", changes: parseStatus(status.stdout).filter(isVersioned) };
  }

  async readTexts(change: VcsChange): Promise<FileTexts> {
    const after = change.status === "deleted" ? null : await this.#options.files.read(change.path);
    return { before: await this.#lastVersionOf(change, after), after };
  }

  async replaceFile(path: string, text: string, expected: string): Promise<ReplaceResult> {
    const result = await this.#options.files.write(path, text, {
      expected: await contentDigest(expected, this.#options.digest),
    });
    return result.status === "written" ? "replaced" : "changed-on-disk";
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
    if (init.code !== 0) throw new KindedError("unavailable", firstLine(init.stderr));
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
      throw new KindedError("unavailable", firstLine(diff.stderr));
    }
    return lastVersionFromDiff(diff.stdout, after);
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

/** Why a version couldn't be created, as one plain sentence: git's own output is never shown. */
function gitReason(answer: GitAnswer): string {
  const said = `${answer.stderr}\n${answer.stdout}`;
  if (/tell me who you are|empty ident name|author identity unknown/i.test(said)) {
    return "Git doesn't know who versions should be from. Set your name and email in git, then try again.";
  }
  if (/nothing (added )?to commit|no changes added/i.test(said)) {
    return "There is nothing to record: these changes are already in a version.";
  }
  if (/index\.lock|another git process/i.test(said)) {
    return "Another program is using this workspace's history right now. Wait a moment, then try again.";
  }
  if (/hook|permission denied|operation not permitted|read-only/i.test(said)) {
    return "Git refused to record the version. A check on this workspace or a permission stopped it.";
  }
  return "Git didn't accept the version.";
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
  return !unversionedFolders.some(
    (folder) => change.path === folder || change.path.startsWith(`${folder}/`),
  );
}
