import type { UpdatesResult, VersionInput } from "@halonicjs/studio-feature-source-control/api";
import { WorkspaceChanges } from "./workspace-changes.ts";

/**
 * The workspace's history, which also tells its listeners when this app changed which version is
 * live: Create version, turning on history, Get updates and finishing a merge. Whether an item is
 * live depends on it, and none of these change a file the workspace watches.
 *
 * @example
 * const changes = new WatchedChanges(options);
 * const stop = changes.onNewVersion(() => void page.refresh());
 */
export class WatchedChanges extends WorkspaceChanges {
  readonly #listeners = new Set<() => void>();

  /** Calls `listener` after each new live version; returns a function that stops it. */
  onNewVersion(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  override async createVersion(input: VersionInput): Promise<void> {
    await super.createVersion(input);
    this.#tell();
  }

  override async turnOnHistory(): Promise<void> {
    await super.turnOnHistory();
    this.#tell();
  }

  override async getUpdates(): Promise<UpdatesResult> {
    const result = await super.getUpdates();
    if (result.kind === "got") this.#tell();
    return result;
  }

  override async finishMerge(message: string): Promise<void> {
    await super.finishMerge(message);
    this.#tell();
  }

  #tell(): void {
    for (const listener of this.#listeners) listener();
  }
}
