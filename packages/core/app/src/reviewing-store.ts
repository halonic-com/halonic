// The workspace store everyone but the review service gets (HAL-3277). Its
// writes and removes go through the review service's write hook, so typing,
// the structured editors, Compare, reload and Undo all move a reviewed
// file's baseline along without each of them remembering to.

import type {
  DefinitionStore,
  DefinitionWatch,
  DefinitionWatchListener,
  WriteOptions,
  WriteResult,
} from "@halonicjs/ports";
import type { FileWriter } from "./review-hook.ts";

/**
 * The workspace's store with its writes and removes passed to a
 * {@link FileWriter}: the review service's write hook. Listing, reading,
 * the version and watching are the store's own. The review records aren't in the
 * workspace (they are in the profile), so there is nothing to hide.
 *
 * @example
 * const review = new ReviewService({ store, records, digest });
 * const files = new WorkspaceFiles(new ReviewingDefinitionStore(store, review.writer), events);
 */
export class ReviewingDefinitionStore implements DefinitionStore {
  private readonly inner: DefinitionStore;
  private readonly writer: FileWriter;

  /**
   * @param inner - the workspace's store
   * @param writer - carries out writes and removes: the review service's write hook
   */
  constructor(inner: DefinitionStore, writer: FileWriter) {
    this.inner = inner;
    this.writer = writer;
  }

  get location(): string {
    return this.inner.location;
  }

  list(dir?: string): Promise<string[]> {
    return this.inner.list(dir);
  }

  read(path: string): Promise<string | null> {
    return this.inner.read(path);
  }

  version(): Promise<string> {
    return this.inner.version();
  }

  write(path: string, content: string, options?: WriteOptions): Promise<WriteResult> {
    return this.writer.write(path, content, options);
  }

  remove(path: string): Promise<void> {
    return this.writer.remove(path);
  }

  /**
   * The store's own watch. The write hook's writes still reach the store,
   * so the store knows them as its own and doesn't report them.
   */
  watch(listener: DefinitionWatchListener): Promise<DefinitionWatch> {
    return this.inner.watch(listener);
  }
}
