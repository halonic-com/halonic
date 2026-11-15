import type { DefinitionStore, DefinitionWatch } from "@halonicjs/ports";
import {
  connectorFacts,
  type GoogleSetupAccount,
  type GoogleSetupAccounts,
} from "@halonicjs/studio-feature-google-setup/api";
import type {
  ConnectorStatus,
  ConnectorStatusHost,
  RecordedRefusal,
  RefusalsFeed,
} from "@halonicjs/studio-feature-library/api";
import { type ConnectionState, connectionStateOf } from "@halonicjs/studio-feature-library/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** What {@link WorkspaceConnectorStatus} reads. */
export interface WorkspaceConnectorStatusOptions {
  /** The workspace's files, where its connectors are declared. */
  readonly definitions: DefinitionStore;
  /** What the engine refused since Halonic started. */
  readonly refusals: RefusalsFeed;
  /** The workspace's Google accounts, where a Google connector's sign-in is kept. */
  readonly google: Pick<GoogleSetupAccounts, "list">;
  /**
   * Calls its listener when the window comes to the front, so the connectors are read again
   * then too; returns a function that stops it.
   */
  readonly onFocus?: (listener: () => void) => () => void;
  /** Called with the error when the files can't be watched; the Studio logs it. */
  readonly onWatchError?: (error: unknown) => void;
}

/**
 * The connectors of one open workspace as the Library's status view reads them
 * (requirement `studio.workspace-connector-status`).
 *
 * A connector's state comes from its file: it is set up, so it counts as connected. What the
 * app can't see yet, such as an expired sign-in, is not in the file and shows only as a refusal
 * when a call fails. A Google connector's sign-in is in its account's setup record, so its state
 * comes from the record, the same one the Google setup block shows. A Google connector whose
 * account has no setup record yet is listed as not connected.
 *
 * @example
 * services.provide(
 *   ConnectorStatusHostService,
 *   new WorkspaceConnectorStatus({ definitions, refusals: new RefusalsFeed(), google }),
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
    const connectors = filesOf(workspace, "connector").map(({ value }) => value);
    const accounts = connectors.some(({ transport }) => "google" in transport)
      ? await this.#options.google.list()
      : [];
    return connectors.map((connector) => ({
      id: connector.id,
      name: connector.name ?? connector.id,
      state: this.#stateOf(connector, accounts),
    }));
  }

  /** A Google connector's state is its account's record's; any other connector is set up by its file. */
  #stateOf(
    connector: { readonly id: string; readonly transport: object },
    accounts: readonly GoogleSetupAccount[],
  ): ConnectionState {
    if (!("google" in connector.transport)) {
      return connectionStateOf({
        configured: true,
        signedIn: true,
        secretValid: true,
        apiOn: true,
      });
    }
    const account = accounts.find(({ record }) => record.connector.id === connector.id);
    return connectionStateOf(
      account === undefined
        ? { configured: false, signedIn: false, secretValid: false, apiOn: false }
        : connectorFacts(account),
    );
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
    const reportWatchError = (error: unknown) => this.#options.onWatchError?.(error);
    // A watch that fails or never opens costs only the live update: the files are still read
    // again on focus. The error is reported, not swallowed.
    const watch: Promise<DefinitionWatch | undefined> = this.#options.definitions
      .watch({ changed: tell, failed: reportWatchError })
      .catch((error: unknown) => {
        reportWatchError(error);
        return undefined;
      });
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
