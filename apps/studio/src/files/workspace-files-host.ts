import type { DefinitionWatch, WorkspaceFileChange } from "@halonicjs/ports";
import type {
  CompareChoice,
  FileCompare,
  FileIssue,
  FilesHost,
  FilesListing,
  OutsideChange,
} from "@halonicjs/studio-feature-files/api";
import { loadWorkspace } from "@halonicjs/workspace";
import { unsavedSource } from "../library/workspace-library-items.ts";

/** What {@link WorkspaceFilesHost} needs of the workspace's files and events. */
export interface FilesHostParts {
  /** The folder's saved files, from its root, recursively. Local data and private entries are already left out. */
  readonly store: {
    list(): Promise<string[]>;
    /** Reports the files that changed outside Halonic; Halonic's own writes are left out. */
    watch?(listener: {
      changed(changes: readonly WorkspaceFileChange[]): void;
      failed(error: Error): void;
    }): Promise<DefinitionWatch>;
  };
  /** The kernel's `WorkspaceFiles`: its unsaved changes by path, `null` for an unsaved delete. */
  readonly files: {
    readonly pending: Readonly<Record<string, string | null>>;
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(
      label: string,
      changes: Record<string, string | null>,
      options?: { coalesceKey?: string },
    ): void;
    /** Takes in outside changes of files with no unsaved changes as one undo step; the rest come back as `held`. */
    reloadFromOutside(paths: readonly string[]): Promise<{ held: string[] }>;
    compare(path: string): Promise<FileCompare>;
    settle(path: string, choice: CompareChoice): Promise<unknown>;
  };
  /** Calls `listener` after every change of the workspace's files and every save; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
}

/**
 * The Files feature's view of the workspace (`studio.workspace-files-host`): saved and unsaved
 * files together, and when they change.
 *
 * @example
 * services.provide(FilesHostService, new WorkspaceFilesHost({ store, files, onChange }));
 */
export class WorkspaceFilesHost implements FilesHost {
  readonly #parts: FilesHostParts;
  readonly #outside = new Map<string, OutsideChange>();
  readonly #listeners = new Set<() => void>();
  #watch: Promise<DefinitionWatch | undefined> | undefined;
  #disposed = false;

  constructor(parts: FilesHostParts) {
    this.#parts = parts;
    this.#watch = parts.store
      .watch?.({
        changed: (changes) => void this.#took(changes),
        // Without a watch only a save that finds the file changed shows it.
        failed: () => undefined,
      })
      .catch(() => undefined);
  }

  outside(): ReadonlyMap<string, OutsideChange> {
    return this.#outside;
  }

  compare(path: string): Promise<FileCompare> {
    return this.#parts.files.compare(path);
  }

  async settle(path: string, choice: CompareChoice): Promise<void> {
    await this.#parts.files.settle(path, choice);
    this.#outside.delete(path);
    this.#tell();
  }

  /** Closes the watch. Disposing twice is fine. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#listeners.clear();
    const watch = this.#watch;
    this.#watch = undefined;
    await (await watch)?.close();
  }

  /** Takes in one batch of outside changes: files without unsaved changes are reloaded, the others are held. */
  async #took(changes: readonly WorkspaceFileChange[]): Promise<void> {
    try {
      const { held } = await this.#parts.files.reloadFromOutside(changes.map(({ path }) => path));
      for (const path of held) {
        const { theirs } = await this.#parts.files.compare(path);
        this.#outside.set(path, theirs === null ? "deleted" : "changed");
      }
    } catch {
      // The next change, or a save that finds the file changed, shows it.
      return;
    }
    this.#tell();
  }

  #tell(): void {
    if (this.#disposed) return;
    for (const listener of this.#listeners) listener();
  }

  async list(): Promise<FilesListing> {
    let saved: string[];
    try {
      saved = await this.#parts.store.list();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(reason.endsWith(".") ? reason : `${reason}.`);
    }
    const paths = new Set(saved);
    for (const [path, text] of Object.entries(this.#parts.files.pending)) {
      if (text === null) paths.delete(path);
      else paths.add(path);
    }
    const marks = await this.#marks();
    return { paths: [...paths].sort(), marks };
  }

  /** The problems and outside changes by file. */
  async #marks(): Promise<Map<string, { errors: number; warnings: number; outside: boolean }>> {
    // A file that has no unsaved changes any more (undone) is no longer waiting for Compare.
    for (const path of this.#outside.keys()) {
      if (!Object.hasOwn(this.#parts.files.pending, path)) this.#outside.delete(path);
    }
    const marks = new Map<string, { errors: number; warnings: number; outside: boolean }>();
    const markOf = (path: string) => {
      const mark = marks.get(path) ?? { errors: 0, warnings: 0, outside: false };
      marks.set(path, mark);
      return mark;
    };
    for (const issue of await this.problems()) {
      markOf(issue.file)[issue.severity === "error" ? "errors" : "warnings"] += 1;
    }
    for (const path of this.#outside.keys()) markOf(path).outside = true;
    return marks;
  }

  async problems(): Promise<readonly FileIssue[]> {
    try {
      const workspace = await loadWorkspace(unsavedSource(this.#parts.files));
      return workspace.issues
        .map(({ file, severity, message, line, col }) => ({ file, severity, message, line, col }))
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
    } catch {
      return [];
    }
  }

  read(path: string): Promise<string | null> {
    return this.#parts.files.read(path);
  }

  edit(path: string, text: string): void {
    this.#parts.files.change(`Edited ${path}`, { [path]: text }, { coalesceKey: path });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    const stop = this.#parts.onChange(listener);
    return () => {
      this.#listeners.delete(listener);
      stop();
    };
  }
}
