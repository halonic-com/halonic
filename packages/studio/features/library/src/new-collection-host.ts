import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { CollectionRef } from "./collection-host.ts";

/** What a person fills in to make a collection. */
export interface NewCollectionDraft {
  readonly name: string;
}

/** Makes collections in the open workspace. The app provides it for each open workspace. */
export interface NewCollectionHost {
  /** Reads the workspace, so `file` is current. The place waits for it before it opens the dialog. */
  prepare(): Promise<void>;
  /**
   * Where the collection's file would be, from the workspace folder:
   * `library/collections/claims.collection.yaml`. Collections are always shared, so there is no
   * hub. With an empty name it is the folder that holds the collections, ending in `/`
   * (`core`'s `newLibraryFile` makes the path).
   */
  file(draft: NewCollectionDraft): string;
  /**
   * Makes the collection (its reference has `hub: null`), with one required text field `name`, as
   * one change that shows in Changes. Rejects with an `Error` of one sentence when it can't.
   */
  create(draft: NewCollectionDraft): Promise<CollectionRef>;
}

export const NewCollectionHostService: ServiceKey<NewCollectionHost> =
  serviceKey<NewCollectionHost>("library.new-collection");
