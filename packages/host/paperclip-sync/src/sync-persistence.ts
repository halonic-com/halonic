import type { StoredCollection } from "./stored-collection.ts";

/**
 * Where one source's local copy is kept between starts, one plain record per collection. The
 * host implements it outside every workspace, in files only the user can read
 * (requirement `agent-host.paperclip-sync`); the store knows nothing of files or folders.
 */
export interface SyncPersistence {
  /** The record saved as `name`, or `undefined` when none was saved or it can't be read. */
  load(name: string): Promise<unknown>;
  /** Replaces the record saved as `name`, whole: a reader finds the old record or the new one. */
  save(name: string, stored: StoredCollection<unknown>): Promise<void>;
  /** Deletes every record of the source, as Disconnect does. */
  clear(): Promise<void>;
}
