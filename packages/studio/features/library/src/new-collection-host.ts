import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { CollectionRef } from "./collection-host.ts";

/** What a person fills in to make a collection. */
export interface NewCollectionDraft {
  readonly name: string;
  /** The hub folder the collection belongs to, or `null` to share it at the workspace root. */
  readonly hub: string | null;
}

/** A hub a new collection can go in. */
export interface NewCollectionHub {
  readonly id: string;
  readonly name: string;
}

/** Makes collections in the open workspace. The app provides it for each open workspace. */
export interface NewCollectionHost {
  /** Reads the workspace, so `hubs` and `file` are current. The place waits for it before it opens the dialog. */
  prepare(): Promise<void>;
  /** The hubs of the workspace, for the dialog's Hub field. */
  hubs(): readonly NewCollectionHub[];
  /**
   * Where the collection's file would be, from the workspace folder:
   * `hubs/acme/library/collections/claims.collection.yaml`. With an empty name it is the folder
   * that holds the collections, ending in `/` (`core`'s `newLibraryFile` makes the path).
   */
  file(draft: NewCollectionDraft): string;
  /**
   * Makes the collection, with one required text field `name`, as one change that shows in
   * Changes. Rejects with an `Error` of one sentence when it can't.
   */
  create(draft: NewCollectionDraft): Promise<CollectionRef>;
}

export const NewCollectionHostService: ServiceKey<NewCollectionHost> =
  serviceKey<NewCollectionHost>("library.new-collection");
