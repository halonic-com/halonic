import type {
  AgentHostPaperclipSignIn,
  PaperclipConnectionList,
  PaperclipConnectionRef,
  PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import type { MessagingId } from "@halonicjs/ports";
import type {
  AgentConnection,
  AgentConnections,
  DisconnectResult,
  SignInResult,
  SignInStart,
} from "./agent-connections.ts";

/** How often a waiting sign-in asks the engine whether the board approved it. */
export const signInPollMs = 2000;

/** What {@link HostAgentConnections} needs. */
export interface HostAgentConnectionsOptions {
  /** The agent host's sign-in and connection list for the open workspace. */
  readonly signIn: Pick<AgentHostPaperclipSignIn, "listed" | "start" | "poll" | "cancel">;
  /** The agent host's Disconnect, which revokes the key and forgets it. */
  readonly host: {
    disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }>;
  };
  /**
   * The Studio shell's restore of the kept keys of `workspace`
   * (`agent_host_paperclip_restore`, `studio.src-tauri.paperclip-key-keep`):
   * the shell decides what goes back, hands it over itself and answers how
   * many keys went back, never a key. It rejects when the host couldn't list
   * the workspace's connections yet.
   */
  readonly restoreKeys: (workspace: string) => Promise<number>;
  /** The open workspace's path, as Studio names it to the host. */
  readonly workspace: string;
  /** Waits between two polls: a timer in the app; tests pass one they move on themselves. */
  readonly wait: (ms: number) => Promise<void>;
  /** The time now, in milliseconds; tests pass a clock of their own. */
  readonly now: () => number;
  /** Hears a failure nobody else is told about, such as a restore that failed. */
  readonly report: (error: unknown) => void;
}

/**
 * The desktop engine's connections, as Settings › Connections and the Connect
 * dialog use them (`services.agent-connections`). The agent host runs the
 * sign-in. Its approved poll's answer is the one that holds the key, and the
 * Studio shell keeps that key: it writes the keychain entry, confirms the
 * sign-in to the host and passes this class the answer without the key
 * (HAL-20278). So no page code, feature, React state or view sees the key.
 * When the shell couldn't keep it, the poll answers `key-not-saved`.
 *
 * The keychain entry names the workspaces the person signed in from, so the
 * shell can give the key back when one of them opens again, once
 * {@link HostAgentConnections.restore} asks it to (`services.paperclip-restore`).
 * No page code reads, writes or holds the key.
 */
export class HostAgentConnections implements AgentConnections {
  readonly #options: HostAgentConnectionsOptions;
  readonly #listeners = new Set<() => void>();
  /** Each listed connection's file name, by its ID, for Sign in again and Disconnect. */
  readonly #names = new Map<MessagingId, string>();
  /** Whether {@link restore} was asked for and no listing has succeeded for it yet. */
  #restorePending = false;
  /** The restore attempt running now, if any. */
  #restoring: Promise<void> | undefined;

  constructor(options: HostAgentConnectionsOptions) {
    this.#options = options;
  }

  async list(): Promise<readonly AgentConnection[]> {
    // A restore whose listing failed, such as while the host was still starting, goes first (HAL-19027).
    if (this.#restorePending) await this.#restoreOnce();
    const { connections: rows } = await this.#listed();
    return rows.map(({ id, label, address, state, userName }) => ({
      id,
      provider: "paperclip",
      label,
      address,
      state,
      ...(userName === undefined ? {} : { userName }),
    }));
  }

  /**
   * Asks the shell, once, when the workspace opens, to give the host back the
   * keys the person signed in with in it (`services.paperclip-restore`). It
   * never throws or asks anything; a failure is reported.
   *
   * When the shell's restore fails, as while the host can't list the
   * workspace's connections right after a start, the restore stays pending
   * and the next {@link list} asks again, until one succeeds (HAL-19027).
   */
  async restore(): Promise<void> {
    this.#restorePending = true;
    await this.#restoreOnce();
  }

  /** One restore attempt; a second caller waits for the one already running. */
  #restoreOnce(): Promise<void> {
    this.#restoring ??= this.#tryRestore().finally(() => {
      this.#restoring = undefined;
    });
    return this.#restoring;
  }

  async #tryRestore(): Promise<void> {
    const { restoreKeys, workspace, report } = this.#options;
    let restored: number;
    try {
      restored = await restoreKeys(workspace);
    } catch (error) {
      report(error);
      return;
    }
    // The shell listed the workspace: what happened to each row is final, and nothing is asked again.
    this.#restorePending = false;
    if (restored > 0) this.#changed();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async signIn(request: {
    readonly address: string;
    readonly connection?: MessagingId;
    readonly newConnection?: boolean;
  }): Promise<SignInStart> {
    const name = request.connection === undefined ? undefined : this.#names.get(request.connection);
    const started =
      request.newConnection === true
        ? await this.#options.signIn.start(request.address, name, { newConnection: true })
        : await this.#options.signIn.start(request.address, name);
    if (started.outcome === "refused") return started;
    let ended = false;
    const cancel = async () => {
      ended = true;
      await this.#options.signIn.cancel(started.signInId);
    };
    const result = this.#follow(started.signInId, Date.parse(started.expiresAt), () => ended);
    const { phrase, approvalUrl, expiresAt } = started;
    return { outcome: "started", challenge: { phrase, approvalUrl, expiresAt, result, cancel } };
  }

  async disconnect(connection: MessagingId): Promise<DisconnectResult> {
    const name = this.#names.get(connection);
    if (name === undefined) throw new Error("No such connection is listed.");
    // The host revokes and forgets the key; the shell deletes its keychain entry, also when the host fails.
    const { host, workspace } = this.#options;
    const { revoked } = await host.disconnect({ workspace, connection: name });
    this.#changed();
    // The engine doesn't say yet when a key expires; Paperclip's keys last 30 days.
    if (revoked) return { revoked: true };
    return { revoked: false, validUntil: new Date(this.#now() + keyLifetimeMs).toISOString() };
  }

  /** Polls until the sign-in ends; it never rejects. */
  async #follow(signInId: string, deadline: number, ended: () => boolean): Promise<SignInResult> {
    for (;;) {
      await this.#options.wait(signInPollMs);
      if (ended()) return { outcome: "cancelled" };
      const state = await this.#options.signIn.poll(signInId).catch(() => undefined);
      // A poll that failed is tried again; the engine ends the sign-in by its own time limit.
      if (state === undefined) {
        if (this.#now() > deadline + signInPollMs) return { outcome: "expired" };
        continue;
      }
      const result = await this.#resultOf(state);
      if (result !== undefined) return result;
    }
  }

  /** The sign-in's end, or `undefined` while it waits. */
  async #resultOf(state: PaperclipSignInState): Promise<SignInResult | undefined> {
    switch (state.status) {
      case "pending":
        return undefined;
      case "connected":
        return this.#connected(state);
      case "key-not-saved":
        this.#changed();
        return { outcome: "key-not-saved" };
      case "expired":
        return { outcome: "expired" };
      case "wrong-company":
        return { outcome: "refused", reason: "other-company" };
      default:
        return { outcome: "cancelled" };
    }
  }

  /** The connected sign-in's result: its row as the host lists it now. The shell kept the key. */
  async #connected(
    state: Extract<PaperclipSignInState, { status: "connected" }>,
  ): Promise<SignInResult> {
    const { connection: name, address } = state;
    this.#changed();
    const listed = await this.list().catch(() => []);
    const connection = listed.find((each) => this.#names.get(each.id) === name);
    // The key is kept either way; a list that failed only leaves the row to the next read.
    return {
      outcome: "connected",
      connection: connection ?? {
        id: name,
        provider: "paperclip",
        label: "Paperclip",
        address,
        state: { kind: "offline", asOf: new Date(this.#now()).toISOString() },
      },
    };
  }

  /** The host's list, keeping each row's file name. */
  async #listed(): Promise<PaperclipConnectionList> {
    const listed = await this.#options.signIn.listed();
    for (const row of listed.connections) this.#names.set(row.id, row.name);
    return listed;
  }

  #now(): number {
    return this.#options.now();
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** Paperclip's sign-in keys expire after 30 days (HAL-17423). */
const keyLifetimeMs = 30 * 24 * 60 * 60 * 1000;
