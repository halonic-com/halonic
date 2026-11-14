import type { DefinitionStore, DefinitionWatch } from "@halonicjs/ports";
import type {
  ConnectorStatus,
  ConnectorStatusHost,
  RecordedRefusal,
  RefusalsFeed,
} from "@halonicjs/studio-feature-library/api";
import { connectionStateOf } from "@halonicjs/studio-feature-library/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** What {@link WorkspaceConnectorStatus} reads. */
export interface WorkspaceConnectorStatusOptions {
  /** The workspace's files, where its connectors are declared. */
  readonly definitions: DefinitionStore;
  /** What the engine refused since Halonic started. */
  readonly refusals: RefusalsFeed;
  /**
   * Calls its listener when the window comes to the front, so the connectors are read again
   * then too; returns a function that stops it.
   */
  readonly onFocus?: (listener: () => void) => () => void;
}

/**
 * The connectors of one open workspace as the Library's status view reads them
 * (requirement `studio.workspace-connector-status`).
 *
 * A connector's state comes from its file: it is set up, so it counts as connected. What the
 * app can't see yet, such as an expired sign-in, is not in the file and shows only as a refusal
 * when a call fails. A Google connector's sign-in is in the account's setup record, which the
 * desktop app doesn't read yet, so Google connectors are left out rather than shown connected
 * on a guess.
 *
 * @example
 * services.provide(
 *   ConnectorStatusHostService,
 *   new WorkspaceConnectorStatus({ definitions, refusals: new RefusalsFeed() }),
 * );
 */
export class WorkspaceConnectorStatus implements ConnectorStatusHost {
  readonly #options: WorkspaceConnectorStatusOptions;
  readonly #listeners = new Set<() => void>();
  #stopWatching: (() => void) | undefined;

  constructor(options: WorkspaceConnectorStatusOptions) {
    this.#options = options;
  }

  async list(): Promise<readonly ConnectorStatus[]> {
    const workspace = await loadWorkspace(this.#options.definitions);
    return filesOf(workspace, "connector")
      .filter(({ value }) => !("google" in value.transport))
      .map(({ value }) => ({
        id: value.id,
        name: value.name ?? value.id,
        state: connectionStateOf({
          configured: true,
          signedIn: true,
          secretValid: true,
          apiOn: true,
        }),
      }));
  }

  async refusals(connectorId: string): Promise<readonly RecordedRefusal[]> {
    return this.#options.refusals.refusals(connectorId);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    this.#startWatching();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stopWatchingAll();
    };
  }

  /** Listens to the refusals, the window's focus and the files, for as long as anyone listens. */
  #startWatching(): void {
    if (this.#stopWatching !== undefined) return;
    const tell = () => {
      for (const listener of [...this.#listeners]) listener();
    };
    const stopRefusals = this.#options.refusals.subscribe(tell);
    const stopFocus = this.#options.onFocus?.(tell) ?? (() => {});
    // A watch that fails or never opens costs only the live update: the files are still read
    // again on focus.
    const watch: Promise<DefinitionWatch | undefined> = this.#options.definitions
      .watch({ changed: tell, failed: () => {} })
      .catch(() => undefined);
    this.#stopWatching = () => {
      stopRefusals();
      stopFocus();
      void watch.then((open) => open?.close());
    };
  }

  #stopWatchingAll(): void {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
  }
}
