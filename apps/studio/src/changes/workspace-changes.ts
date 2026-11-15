import type { DefinitionStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { unversionedFolders, type VcsChange } from "@halonicjs/ports";
import type { ChangesRead, ChangesSource } from "@halonicjs/studio-feature-source-control/api";
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
    if (status.code !== 0) throw new KindedError("unavailable", status.stderr.trim());
    return { kind: "ready", changes: parseStatus(status.stdout).filter(isVersioned) };
  }

  async turnOnHistory(): Promise<void> {
    // The ignore line first, so a failed init never leaves `.studio/` showing up as changed.
    await this.#ignoreStudioFolder();
    const init = await this.#run(["init", "--quiet"]);
    if (init === "no-git") throw new KindedError("unavailable", "git isn't on this computer.");
    if (init.code !== 0) throw new KindedError("unavailable", init.stderr.trim());
  }

  subscribe(listener: () => void): () => void {
    const stops = [this.#options.onFocus(listener), this.#options.onFilesChanged(listener)];
    return () => {
      for (const stop of stops) stop();
    };
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
