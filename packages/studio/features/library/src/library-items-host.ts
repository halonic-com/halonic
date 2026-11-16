import type { ItemUsage, LibraryItemKind } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** One skill, knowledge source, collection or connector, as a Library row needs it. */
export interface LibraryEntry {
  readonly id: string;
  readonly name: string;
  /** What it is for ("when to use it" for a skill); the search reads it. */
  readonly description?: string;
  /** The row's one line: a skill's "when to use it", a collection's "3 fields · 12 records". */
  readonly detail?: string;
  /** Who uses it: the app asks `whoUses` of core for each entry. */
  readonly usage: ItemUsage;
}

/** A hub and its entries of one kind. */
export interface LibraryHubEntries {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly LibraryEntry[];
}

/** Everything of one kind in the open workspace: each hub's own, then what the workspace shares. */
export interface LibraryListing {
  readonly hubs: readonly LibraryHubEntries[];
  readonly shared?: {
    readonly workspaceName: string;
    readonly entries: readonly LibraryEntry[];
  };
}

/** Where an item sits: its hub's id, or `null` when the workspace shares it. */
export interface LibraryItemPlace {
  readonly hub: string | null;
  readonly id: string;
}

/** An item that was moved to the trash, and the way to bring it back. */
export interface RemovedLibraryItem {
  /** Puts the item back where it was. Rejects with an `Error` whose message is one sentence when it can't. */
  undo(): Promise<void>;
}

/** The items of the open workspace. The app provides it for each open workspace. */
export interface LibraryItemsHost {
  /** The workspace's items of one kind. Rejects with an `Error` whose message is one sentence when they can't be read. */
  list(kind: LibraryItemKind): Promise<LibraryListing>;
  /**
   * Moves one item to the trash, as one change that shows in Changes and goes to the trash when saved.
   * Rejects with an `Error` whose message is one sentence when it can't, such as when the item is gone.
   */
  remove(kind: LibraryItemKind, place: LibraryItemPlace): Promise<RemovedLibraryItem>;
  /** Calls `listener` whenever a Library item may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const LibraryItemsHostService: ServiceKey<LibraryItemsHost> =
  serviceKey<LibraryItemsHost>("library.items");
