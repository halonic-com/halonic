import type { Connector } from "@halonicjs/format";
import type { ChatTurnWaiting, DefinitionStore, DefinitionWatch } from "@halonicjs/ports";
import {
  connectorFacts,
  type GoogleSetupAccount,
  type GoogleSetupAccounts,
} from "@halonicjs/studio-feature-google-setup/api";
import type {
  ConnectorAsks,
  ConnectorConnection,
  ConnectorStatus,
  ConnectorStatusHost,
  RecordedRefusal,
  RefusalsFeed,
} from "@halonicjs/studio-feature-library/api";
import { type ConnectionState, connectionStateOf } from "@halonicjs/studio-feature-library/api";
import { filesOf, loadWorkspace, placeOf } from "@halonicjs/workspace";

/** What {@link WorkspaceConnectorStatus} reads. */
export interface WorkspaceConnectorStatusOptions {
  /** The workspace's files, where its connectors are declared. */
  readonly definitions: DefinitionStore;
  /** What the engine refused since Halonic started. */
  readonly refusals: RefusalsFeed;
  /** The workspace's Google accounts, where a Google connector's sign-in is kept. */
  readonly google: Pick<GoogleSetupAccounts, "list" | "subscribe">;
  /**
   * Calls its listener when the window comes to the front, so the connectors are read again
   * then too; returns a function that stops it.
   */
  readonly onFocus?: (listener: () => void) => () => void;
  /** Called with the error when the files can't be watched; the Studio logs it. */
  readonly onWatchError?: (error: unknown) => void;
}

/** The state of a Google connector whose account has no setup record yet. */
const notSetUp: ConnectionState = connectionStateOf({
  configured: false,
  signedIn: false,
  secretValid: false,
  apiOn: false,
});

/** How a connector file says it connects. Secrets by name only. */
function connectionOf({ transport, secret }: Connector): ConnectorConnection {
  if ("http" in transport) {
    return {
      kind: "http",
      url: transport.http.url,
      secrets: secret === undefined ? [] : [secret],
    };
  }
  if ("stdio" in transport) {
    const { command, args, secretEnv } = transport.stdio;
    return {
      kind: "stdio",
      command: [command, ...args].join(" "),
      secrets: Object.values(secretEnv ?? {}),
    };
  }
  if ("google" in transport) return { kind: "google", account: transport.google.account };
  if ("integration" in transport)
    return { kind: "integration", folder: transport.integration.folder };
  return { kind: "plugin", id: transport.plugin.id };
}

/** What the file says about asking first, in the two ways the New connector dialog writes it. */
function asksOf({ transport, tools }: Connector): ConnectorAsks | undefined {
  if (tools.approve === "all") return "every-tool";
  if ("google" in transport && tools.approve.length > 0) return "changes";
  return undefined;
}

/**
 * The connectors of one open workspace as the Library's status view reads them
 * (requirement `studio.workspace-connector-status`).
 *
 * A connector's file says it is set up, not that it works, so its state is "Not checked yet"
 * until something reads its sign-in and secret; it never says "Connected" on a guess. A connector
 * whose file doesn't read is listed with an error state, so its page doesn't say it is gone.
 * An expired sign-in shows as a refusal when a call fails. A Google connector's sign-in is in its
 * account's setup record, so its state comes from the record, the same one the Google setup block
 * shows. A Google connector whose account has no setup record yet is listed as not connected.
 * When an account's setup changes, the status tells its listeners, so the Library never shows an
 * older state than the setup block.
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
    const files = filesOf(workspace, "connector");
    const connectors = files.map(({ value }) => value);
    const accounts = connectors.some(({ transport }) => "google" in transport)
      ? await this.#options.google.list()
      : [];
    const listed = connectors.map((connector): ConnectorStatus => {
      const asks = asksOf(connector);
      return {
        id: connector.id,
        name: connector.name ?? connector.id,
        state: this.#stateOf(connector, accounts),
        connection: connectionOf(connector),
        ...(asks === undefined ? {} : { asks }),
      };
    });
    // A file that parsed is not an unreadable one.
    const known = new Set(connectors.map(({ id }) => id));
    const unreadable = new Set<string>();
    for (const { file } of workspace.issues) {
      const place = placeOf(file);
      if (place?.kind !== "connector" || place.placeId === undefined) continue;
      if (known.has(place.placeId) || unreadable.has(place.placeId)) continue;
      unreadable.add(place.placeId);
    }
    return [
      ...listed,
      ...[...unreadable].map(
        (id): ConnectorStatus => ({
          id,
          name: id,
          state: "unreadable",
          reason:
            "Halonic couldn't read this connector's file. Open the file and fix what it says.",
        }),
      ),
    ];
  }

  /** A Google connector's state is its account's record's; any other connector is not checked yet. */
  #stateOf(
    connector: { readonly id: string; readonly transport: object },
    accounts: readonly GoogleSetupAccount[],
  ): ConnectionState {
    if (!("google" in connector.transport)) return "not-checked";
    const account = accounts.find(({ record }) => record.connector.id === connector.id);
    return account === undefined ? notSetUp : connectionStateOf(connectorFacts(account));
  }

  async refusals(connectorId: string): Promise<readonly RecordedRefusal[]> {
    return this.#options.refusals.refusals(connectorId);
  }

  async waiting(connectorId: string): Promise<readonly ChatTurnWaiting[]> {
    return this.#options.refusals.waiting(connectorId);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    this.#startWatching();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stopWatchingAll();
    };
  }

  /** Listens to the refusals, the Google accounts, the window's focus and the files, for as long as anyone listens. */
  #startWatching(): void {
    if (this.#stopWatching !== undefined) return;
    const tell = () => {
      for (const listener of [...this.#listeners]) listener();
    };
    const stopRefusals = this.#options.refusals.subscribe(tell);
    const stopGoogle = this.#options.google.subscribe(tell);
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
      stopGoogle();
      stopFocus();
      void watch.then((open) => open?.close());
    };
  }

  #stopWatchingAll(): void {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
  }
}
