import { rm } from "node:fs/promises";
import type { ConnectionRowState } from "@halonicjs/adapter-agent-host-client";
import { CachedAgentMessaging } from "@halonicjs/adapter-agent-messaging-cache";
import { type PaperclipTeamStatus, paperclipSourceId } from "@halonicjs/adapter-paperclip-client";
import type { PaperclipConnection } from "@halonicjs/format";
import type { PaperclipConnectionNow, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { type MessagingFailure, MessagingHub } from "@halonicjs/host-agent-messaging-hub";
import { StoredAgentMessaging, type SyncCounters } from "@halonicjs/host-paperclip-sync";
import type {
  AgentMessaging,
  MessagingId,
  MessagingSource,
  MessagingSourceState,
  TeamStatus,
} from "@halonicjs/ports";
import { paperclipConnectionNamePattern } from "../paperclip/paperclip-key-routes.ts";
import { ChangeLog, type ChangesSince, changesWaitMs } from "./change-log.ts";
import { listConnectionFiles } from "./connection-file.ts";
import type { MessagingEngine } from "./messaging-engine-setting.ts";
import {
  type PaperclipConnectionProvider,
  type PaperclipProviderOptions,
  paperclipProvider,
  paperclipTeamStatus,
  withUserName,
} from "./paperclip-provider.ts";
import { type JoinedEngine, ServerEngineInUse } from "./server-engine.ts";
import type { Reach } from "./server-reach.ts";
import { syncFiles } from "./sync-files.ts";
import { TeamStatusHub } from "./team-status-hub.ts";

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
  /** What the workspace's messaging engine setting joins; "This computer" by default. */
  engine?: JoinedEngine;
  /** Counts every change the local copies apply and every Paperclip call (`agent-host.sync-diagnostics`). */
  counters?: Pick<SyncCounters, "applied" | "called">;
}

/** What the Messenger's activity panel reads: each connected source's runs and pull requests. */
export type WorkspaceActivity = Required<Pick<TeamStatus, "runs">> &
  Pick<TeamStatus, "pullRequests">;

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
  /** "Paperclip · Halonic", and whom it is signed in as once known: "Paperclip · Halonic · Board Supervisor". */
  label: string;
  address: string;
  /** The Paperclip company's ID the file names, which Studio compares with its keychain entry. */
  company: string;
  /** `no-key` while this computer holds no key for it; `signed-out` only once Paperclip refused the key. */
  state: ConnectionRowState;
  /** The Paperclip user the connection is signed in as, once read. */
  userName?: string;
}

/**
 * The desktop engine's `AgentMessaging` for one workspace (ADR 2026-11-24,
 * agent messaging, deployment (a)): a Paperclip provider for each connection
 * the person connected, joined by the hub, with the offline cache in front.
 * A connection file alone makes no provider, so opening a workspace calls
 * nobody (`agent-host.paperclip-connection`). Connect and Disconnect make the
 * hub again with the providers that are left.
 *
 * When the workspace's engine is a server (`agent-host.messaging-engine`),
 * the hub joins that server's client in place of every Paperclip provider,
 * behind the same cache; Connect and Disconnect are refused until it is
 * "This computer" again, and the Paperclip providers kept meanwhile are
 * joined again then.
 */
export class WorkspaceMessaging {
  readonly #options: WorkspaceMessagingOptions;
  /** Each connected connection's provider, by the connection's name. */
  readonly #providers = new Map<string, PaperclipConnectionProvider>();
  /** Each connected connection's provider answered from its local copy, as the hub joins it. */
  readonly #stored = new Map<string, StoredAgentMessaging>();
  /** Each connected connection's team status, by the connection's name. */
  readonly #teams = new Map<string, PaperclipTeamStatus>();
  readonly #changes = new ChangeLog();
  #engine: JoinedEngine;
  #hub: MessagingHub;
  #served: CachedAgentMessaging;
  #team: TeamStatusHub;

  constructor(options: WorkspaceMessagingOptions) {
    this.#options = options;
    this.#engine = options.engine ?? { kind: "this-computer" };
    this.#hub = this.#joined();
    this.#served = this.#cached(this.#hub);
    this.#team = this.#teamJoined();
    this.#follow();
  }

  /** The workspace's real path, as the launcher named it. */
  get workspace(): string {
    return this.#options.workspace;
  }

  /** Where the workspace's messaging runs now; never the token. */
  get engine(): MessagingEngine {
    const engine = this.#engine;
    return engine.kind === "server" ? { kind: "server", address: engine.address } : engine;
  }

  /** What the host last heard from the joined server; `undefined` on this computer or before its first call. */
  get serverReach(): Reach | undefined {
    return this.#engine.kind === "server" ? this.#engine.reach.last : undefined;
  }

  /**
   * Joins `engine` in place of the one before: only the hub's providers
   * change, behind a cache over the same folder, and Studio's routes stay as
   * they are. Every source either engine served is named on `changes`.
   */
  switchEngine(engine: JoinedEngine): void {
    const before = this.#sourceNames();
    this.#engine = engine;
    this.#rejoin();
    for (const source of new Set([...before, ...this.#sourceNames()])) this.#changes.note(source);
  }

  /**
   * Back to "This computer" after a server (`agent-host.server-engine-pairing`):
   * joins the Paperclip providers kept meanwhile and deletes everything the
   * cache kept for this workspace, so nothing the server answered stays here.
   * The providers' next reads fill it again.
   */
  async leaveServer(): Promise<void> {
    this.switchEngine({ kind: "this-computer" });
    await rm(this.#options.cacheFolder, { recursive: true, force: true });
  }

  /** What Studio reads and answers through: every connected source, cached. */
  get messaging(): AgentMessaging {
    return this.#served;
  }

  /** Every connected source's team status, under the team hub's freshness rules and cache. */
  get team(): TeamStatus {
    return this.#team;
  }

  /**
   * What the activity panel reads (`agent-host.team-activity-routes`): every
   * connected source's runs, kept in memory only, and its pull requests,
   * under the team hub's freshness rules and cache.
   */
  get activity(): WorkspaceActivity {
    return this.#team;
  }

  /**
   * Starts the provider of a connection whose key Studio just handed over,
   * replacing the one before. Its one request reads whom the key belongs to
   * (`agent-host.paperclip-signed-in-user`); when that fails, the next poll
   * tries again. A connection whose file is gone gets no provider.
   */
  async connect(connection: string): Promise<void> {
    this.#refuseOnServer();
    const binding = { workspace: this.#options.workspace, connection };
    const file = await this.#options.readConnection(binding.workspace, connection);
    const made: PaperclipProviderOptions | undefined =
      file === undefined
        ? undefined
        : {
            binding,
            keys: this.#options.keys,
            label: file.label,
            readNow: () => this.#options.readConnection(binding.workspace, connection),
            reportUserRead: (error) => {
              const provider = paperclipSourceId(connection);
              this.#options.report({ provider, action: "read user", error });
            },
            ...this.#network(),
          };
    const provider = made === undefined ? undefined : paperclipProvider(made);
    const team = made === undefined ? undefined : paperclipTeamStatus(made);
    await provider?.readUser();
    if (provider === undefined) {
      this.#providers.delete(connection);
      this.#stored.delete(connection);
    } else {
      this.#providers.set(connection, provider);
      this.#stored.set(connection, this.#storedOf(connection, provider));
    }
    if (team === undefined) this.#teams.delete(connection);
    else this.#teams.set(connection, team);
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
    this.#refuseOnServer();
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
   * The workspace's connection files, each with its state: `no-key` until
   * the person connects it here, or Studio hands its key over again. It reads
   * Paperclip only for connections the person connected, as Inbox does; when
   * that fails they show as offline.
   */
  async connections(): Promise<ConnectionRow[]> {
    const { workspace, now } = this.#options;
    const files = await listConnectionFiles(workspace, paperclipConnectionNamePattern);
    const joined = this.#engine.kind === "this-computer";
    const sources =
      !joined || this.#providers.size === 0
        ? []
        : await this.#served.listSources().catch((error: unknown) => {
            this.#failed("list connections", error);
            return undefined;
          });
    const asOf = (now?.() ?? new Date()).toISOString();
    return files.map(({ name, connection }) => {
      const id = paperclipSourceId(name);
      const provider = joined ? this.#providers.get(name) : undefined;
      const userName = provider?.userName;
      const label = `Paperclip · ${connection.label}`;
      return {
        id,
        name,
        label: userName === undefined ? label : withUserName(label, userName),
        address: connection.address,
        company: connection.company,
        state: rowState(joined, provider === undefined, () => stateOf(id, sources, asOf)),
        ...(userName === undefined ? {} : { userName }),
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

  /**
   * The sources that changed after `after`, as soon as one does, or none after
   * {@link changesWaitMs} or when `signal` aborts: Studio's long poll.
   */
  waitForChanges(after: number, signal?: AbortSignal): Promise<ChangesSince> {
    return this.#changes.waitSince(after, changesWaitMs, signal);
  }

  /** Stops following the providers' changes and answers every waiting look, when the host stops. */
  close(): void {
    this.#changes.close((error) => this.#failed("changes", error));
  }

  /** Forgets the connection's key, drops its provider and deletes its cache. */
  async #drop(connection: string): Promise<void> {
    const source = paperclipSourceId(connection);
    const stored = this.#stored.get(connection);
    this.#options.keys.forget({ workspace: this.#options.workspace, connection });
    this.#providers.delete(connection);
    this.#stored.delete(connection);
    this.#teams.delete(connection);
    this.#rejoin();
    await this.#served.clear(source);
    // Closes the held copy first, so a poll, answer or send still in flight can't write it again.
    await stored?.clear();
    // Also a copy saved before this start, when no provider holds it.
    await syncFiles(this.#options.cacheFolder, source, this.#options.warn).clear();
    await this.#team.clear(source);
    this.#changes.note(source);
  }

  #rejoin(): void {
    this.#hub = this.#joined();
    this.#served = this.#cached(this.#hub);
    this.#team = this.#teamJoined();
    this.#follow();
  }

  /** The team hub over each connected connection's team status, named as its source, as the messaging hub's providers are. */
  #teamJoined(): TeamStatusHub {
    const { cacheFolder, workspaceRoots, warn, report, now } = this.#options;
    // A server's runs and pull requests aren't read yet: its team status is empty.
    const teams = this.#engine.kind === "this-computer" ? [...this.#teams] : [];
    const providers = teams.map(([connection, status]) => ({
      name: paperclipSourceId(connection),
      status,
    }));
    const clock = { now: () => now?.() ?? new Date() };
    return new TeamStatusHub({
      providers,
      clock,
      folder: cacheFolder,
      workspaceRoots,
      warn,
      report,
    });
  }

  #joined(): MessagingHub {
    const engine = this.#engine;
    const providers =
      engine.kind === "server"
        ? serverProviders(engine)
        : [...this.#stored].map(([connection, messaging]) => ({
            name: paperclipSourceId(connection),
            messaging,
          }));
    return new MessagingHub({ providers, report: this.#options.report });
  }

  /**
   * The provider answered from its local copy (`agent-host.paperclip-sync`), saved in this
   * workspace's cache folder. A provider that is signed out isn't read again.
   */
  #storedOf(connection: string, provider: PaperclipConnectionProvider): StoredAgentMessaging {
    const source = paperclipSourceId(connection);
    const { cacheFolder, warn, counters } = this.#options;
    return new StoredAgentMessaging({
      live: provider,
      sync: provider.sync(),
      source,
      persistence: syncFiles(cacheFolder, source, warn),
      warn,
      mayRead: () => provider.mayRead(),
      ...(counters === undefined ? {} : { counters }),
    });
  }

  #cached(hub: MessagingHub): CachedAgentMessaging {
    const { cacheFolder, workspaceRoots, warn } = this.#options;
    return new CachedAgentMessaging(hub, { folder: cacheFolder, workspaceRoots, warn });
  }

  #follow(): void {
    this.#changes.follow(this.#hub.changes(), (error) => this.#failed("changes", error));
  }

  /** The sources the joined engine serves, as the cache keeps them. */
  #sourceNames(): MessagingId[] {
    if (this.#engine.kind === "server") return [serverSourceName];
    return [...this.#providers.keys()].map(paperclipSourceId);
  }

  #refuseOnServer(): void {
    if (this.#engine.kind === "server") throw new ServerEngineInUse();
  }

  #failed(action: string, error: unknown): void {
    this.#options.report({ provider: "messaging-hub", action, error });
  }

  #network(): Pick<PaperclipProviderOptions, "fetch" | "now" | "timing"> {
    const { fetch, now, counters } = this.#options;
    return {
      ...(fetch === undefined ? {} : { fetch }),
      ...(now === undefined ? {} : { now }),
      ...(counters === undefined ? {} : { timing: (call) => counters.called(call) }),
    };
  }
}

/** The name a server's failures are reported under, and what `changes` names when it switches. */
const serverSourceName = "halonic-server";

/** The server's client, when the workspace has a token it can use. */
function serverProviders(engine: Extract<JoinedEngine, { kind: "server" }>) {
  return engine.messaging === undefined
    ? []
    : [{ name: serverSourceName, messaging: engine.messaging }];
}

/**
 * A row's state. On this computer, a connection the host holds no key for is
 * `no-key`, so Studio doesn't call a key that is still valid "expired or
 * revoked" (HAL-19032); a server engine's rows stay `signed-out`, as before.
 */
function rowState(
  joined: boolean,
  noKey: boolean,
  connected: () => MessagingSourceState,
): ConnectionRowState {
  if (!joined) return { kind: "signed-out" };
  return noKey ? { kind: "no-key" } : connected();
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
