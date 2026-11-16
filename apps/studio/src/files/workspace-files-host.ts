import type { FilesHost, FilesListing } from "@halonicjs/studio-feature-files/api";

/** What {@link WorkspaceFilesHost} needs of the workspace's files and events. */
export interface FilesHostParts {
  /** The folder's saved files, from its root, recursively. Local data and private entries are already left out. */
  readonly store: { list(): Promise<string[]> };
  /** The kernel's `WorkspaceFiles`: its unsaved changes by path, `null` for an unsaved delete. */
  readonly files: {
    readonly pending: Readonly<Record<string, string | null>>;
    read(path: string): Promise<string | null>;
    change(
      label: string,
      changes: Record<string, string | null>,
      options?: { coalesceKey?: string },
    ): void;
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

  constructor(parts: FilesHostParts) {
    this.#parts = parts;
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
    return { paths: [...paths].sort(), marks: new Map() };
  }

  read(path: string): Promise<string | null> {
    return this.#parts.files.read(path);
  }

  edit(path: string, text: string): void {
    this.#parts.files.change(`Edited ${path}`, { [path]: text }, { coalesceKey: path });
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }
}
