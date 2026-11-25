import { CachedAgentMessaging } from "@halonicjs/adapter-agent-messaging-cache";
import { type PaperclipMessaging, paperclipSourceId } from "@halonicjs/adapter-paperclip-client";
import type { PaperclipConnection } from "@halonicjs/format";
import type { PaperclipConnectionNow, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { type MessagingFailure, MessagingHub } from "@halonicjs/host-agent-messaging-hub";
import type {
  AgentMessaging,
  MessagingId,
  MessagingSource,
  MessagingSourceState,
} from "@halonicjs/ports";
import { paperclipConnectionNamePattern } from "../paperclip/paperclip-key-routes.ts";
import { ChangeLog, type ChangesSince } from "./change-log.ts";
import { listConnectionFiles } from "./connection-file.ts";
import { paperclipProvider } from "./paperclip-provider.ts";

/** What one workspace's messaging needs. */
export interface WorkspaceMessagingOptions {
  /** The workspace's real path, as the launcher named it. */
  workspace: string;
  keys: PaperclipKeys;
  /** This workspace's cache folder, in the app data folder. */
  cacheFolder: string;
  /** Every workspace folder the host serves; the cache folder must be outside each. */
  workspaceRoots: readonly string[];
  /** Reads `connections/paperclip/<connection>.yaml` in the workspace as it is now. */
  readConnection: (
    workspace: string,
    connection: string,
  ) => Promise<PaperclipConnection | undefined>;
  /** Hears every provider failure the host carries on past; the host logs it. */
  report: (failure: MessagingFailure) => void;
  /** Says which cache file was broken and read as missing. */
  warn: (message: string) => void;
  /** The `fetch` the providers send with; the global one by default. */
  fetch?: typeof fetch;
  now?: () => Date;
}

/** What Disconnect did: whether Paperclip revoked the key. The key and the cache are gone either way. */
export interface Disconnected {
  revoked: boolean;
}

/** One connection file as Settings › Connections lists it; never a key. */
export interface ConnectionRow {
  /** The connection's source ID, as `AgentMessaging` gives it. */
  id: MessagingId;
  /** The file name without `.yaml`. */
  name: string;
  /** "Paperclip · Halonic". */
  label: string;
  address: string;
  state: MessagingSourceState;
}

/**
 * The desktop engine's `AgentMessaging` for one workspace (ADR 2026-11-24,
 * agent messaging, deployment (a)): a Paperclip provider for each connection
 * the person connected, joined by the hub, with the offline cache in front.
 * A connection file alone makes no provider, so opening a workspace calls
 * nobody (`agent-host.paperclip-connection`). Connect and Disconnect make the
 * hub again with the providers that are left.
 */
export class WorkspaceMessaging {
  readonly #options: WorkspaceMessagingOptions;
  /** Each connected connection's provider, by the connection's name. */
  readonly #providers = new Map<string, PaperclipMessaging>();
  readonly #changes = new ChangeLog();
  #hub: MessagingHub;
  #served: CachedAgentMessaging;

  constructor(options: WorkspaceMessagingOptions) {
    this.#options = options;
    this.#hub = this.#joined();
    this.#served = this.#cached(this.#hub);
    this.#follow();
  }

  /** The workspace's real path, as the launcher named it. */
  get workspace(): string {
    return this.#options.workspace;
  }

  /** What Studio reads and answers through: every connected source, cached. */
  get messaging(): AgentMessaging {
    return this.#served;
  }

  /**
   * Starts the provider of a connection whose key Studio just handed over,
   * replacing the one before. It sends nothing itself: the first request
   * comes when Studio reads or the poller polls. A connection whose file is
   * gone gets no provider.
   */
  async connect(connection: string): Promise<void> {
    const binding = { workspace: this.#options.workspace, connection };
    const file = await this.#options.readConnection(binding.workspace, connection);
    const provider =
      file === undefined
        ? undefined
        : paperclipProvider({
            binding,
            keys: this.#options.keys,
            label: file.label,
            readNow: () => this.#options.readConnection(binding.workspace, connection),
            ...this.#network(),
          });
    if (provider === undefined) this.#providers.delete(connection);
    else this.#providers.set(connection, provider);
    this.#rejoin();
    this.#changes.note(paperclipSourceId(connection));
  }

  /**
   * Disconnect (`agent-host.paperclip-key`): asks Paperclip to revoke the
   * key, then forgets the key and deletes the source's cache, also when the
   * revoke failed or Paperclip can't be reached. Studio then deletes the
   * keychain entry and, when `revoked` is false, says the key stays valid
   * until its expiry.
   */
  async disconnect(connection: string): Promise<Disconnected> {
    const source = paperclipSourceId(connection);
    const provider = this.#providers.get(connection);
    let revoked = false;
    try {
      revoked = (await provider?.revoke()) ?? false;
    } catch (error) {
      this.#options.report({ provider: source, action: "revoke", error });
    }
    await this.#drop(connection);
    return { revoked };
  }

  /**
   * Forgets the key held for `connection` here when it was made for the same
   * address and company as `madeFor`, the key another workspace just
   * disconnected. Studio keeps one keychain entry per connection name, so the
   * key is gone from the keychain and, if the revoke failed, still valid:
   * this workspace stops using it too, and deletes the source's cache. A key
   * made for another address or company is a different key and stays.
   */
  async forgetSameKey(connection: string, madeFor: PaperclipConnectionNow): Promise<void> {
    const held = this.#options.keys.madeFor({ workspace: this.#options.workspace, connection });
    if (held?.address !== madeFor.address || held.company !== madeFor.company) return;
    await this.#drop(connection);
  }

  /**
   * The workspace's connection files, each with its state: signed out until
   * the person connects it here. It reads Paperclip only for connections
   * the person connected, as Inbox does; when that fails they show as offline.
   */
  async connections(): Promise<ConnectionRow[]> {
    const { workspace, now } = this.#options;
    const files = await listConnectionFiles(workspace, paperclipConnectionNamePattern);
    const sources =
      this.#providers.size === 0
        ? []
        : await this.#served.listSources().catch((error: unknown) => {
            this.#failed("list connections", error);
            return undefined;
          });
    const asOf = (now?.() ?? new Date()).toISOString();
    return files.map(({ name, connection }) => {
      const id = paperclipSourceId(name);
      return {
        id,
        name,
        label: `Paperclip · ${connection.label}`,
        address: connection.address,
        state: this.#providers.has(name) ? stateOf(id, sources, asOf) : { kind: "signed-out" },
      };
    });
  }

  /** Reads every connected source again; each names its source on `changes` when something changed. */
  refresh(): Promise<void> {
    return this.#hub.refresh();
  }

  /** The sources that changed after `after`, for Studio's next look. */
  changesSince(after: number): ChangesSince {
    return this.#changes.since(after);
  }

  /** Stops following the providers' changes, when the host stops. */
  close(): void {
    this.#changes.stop((error) => this.#failed("changes", error));
  }

  /** Forgets the connection's key, drops its provider and deletes its cache. */
  async #drop(connection: string): Promise<void> {
    const source = paperclipSourceId(connection);
    this.#options.keys.forget({ workspace: this.#options.workspace, connection });
    this.#providers.delete(connection);
    this.#rejoin();
    await this.#served.clear(source);
    this.#changes.note(source);
  }

  #rejoin(): void {
    this.#hub = this.#joined();
    this.#served = this.#cached(this.#hub);
    this.#follow();
  }

  #joined(): MessagingHub {
    const providers = [...this.#providers].map(([connection, messaging]) => ({
      name: paperclipSourceId(connection),
      messaging,
    }));
    return new MessagingHub({ providers, report: this.#options.report });
  }

  #cached(hub: MessagingHub): CachedAgentMessaging {
    const { cacheFolder, workspaceRoots, warn } = this.#options;
    return new CachedAgentMessaging(hub, { folder: cacheFolder, workspaceRoots, warn });
  }

  #follow(): void {
    this.#changes.follow(this.#hub.changes(), (error) => this.#failed("changes", error));
  }

  #failed(action: string, error: unknown): void {
    this.#options.report({ provider: "messaging-hub", action, error });
  }

  #network(): Pick<WorkspaceMessagingOptions, "fetch" | "now"> {
    const { fetch, now } = this.#options;
    return { ...(fetch === undefined ? {} : { fetch }), ...(now === undefined ? {} : { now }) };
  }
}

/** A connected source's state; offline when its sources couldn't be read. */
function stateOf(
  id: MessagingId,
  sources: readonly MessagingSource[] | undefined,
  asOf: string,
): MessagingSourceState {
  if (sources === undefined) return { kind: "offline", asOf };
  return sources.find((source) => source.id === id)?.state ?? { kind: "signed-out" };
}
