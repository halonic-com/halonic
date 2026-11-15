import type { LibraryItemKind } from "@halonicjs/app";
import { type LibraryTabMemory, libraryKinds } from "@halonicjs/studio-feature-library/api";

/** The part of `Storage` that remembers one tab. */
export interface TabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Which Library tab a workspace was last on (`studio.workspace-library-tab`), kept per workspace
 * folder in the window's storage, so it survives a restart. Storage that can't be read or written
 * (a full or blocked one) leaves the tab as it was in this session.
 *
 * @example
 * services.provide(LibraryTabMemoryService, new WorkspaceLibraryTab(window.localStorage, location));
 */
export class WorkspaceLibraryTab implements LibraryTabMemory {
  readonly #storage: TabStorage | undefined;
  readonly #key: string;
  #kept: LibraryItemKind | undefined;

  constructor(storage: TabStorage | undefined, location: string) {
    this.#storage = storage;
    this.#key = `halonic.library-tab:${location}`;
  }

  get(): LibraryItemKind | undefined {
    if (this.#kept !== undefined) return this.#kept;
    try {
      const stored = this.#storage?.getItem(this.#key);
      return libraryKinds.find((kind) => kind === stored);
    } catch {
      return undefined;
    }
  }

  set(kind: LibraryItemKind): void {
    this.#kept = kind;
    try {
      this.#storage?.setItem(this.#key, kind);
    } catch {
      // Kept for this session only.
    }
  }
}
