import type {
  AgentHostPaperclipSignIn,
  PaperclipConnectionRef,
  PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import type { MessagingId, TokenStore } from "@halonicjs/ports";
import type {
  AgentConnection,
  AgentConnections,
  DisconnectResult,
  SignInResult,
  SignInStart,
} from "./agent-connections.ts";
import {
  disconnectPaperclip,
  paperclipKeyEntryText,
  paperclipKeyTokenName,
} from "./paperclip-key.ts";

/** How often a waiting sign-in asks the engine whether the board approved it. */
export const signInPollMs = 2000;

/** What {@link HostAgentConnections} needs. */
export interface HostAgentConnectionsOptions {
  /** The agent host's sign-in and connection list for the open workspace. */
  readonly signIn: Pick<AgentHostPaperclipSignIn, "connections" | "start" | "poll" | "cancel">;
  /** The agent host's Disconnect, which revokes the key and forgets it. */
  readonly host: {
    disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }>;
  };
  /** The keychain's tokens, where each connection's key is kept. */
  readonly tokens: Pick<TokenStore, "set" | "remove">;
  /** The open workspace's real path. */
  readonly workspace: string;
  /** Waits between two polls: a timer in the app; tests pass one they move on themselves. */
  readonly wait: (ms: number) => Promise<void>;
  /** The time now, in milliseconds; tests pass a clock of their own. */
  readonly now: () => number;
  /** Hears a failure nobody else is told about, such as a failed revoke after a failed keychain write. */
  readonly report: (error: unknown) => void;
}

/**
 * The desktop engine's connections, as Settings › Connections and the Connect
 * dialog use them (`services.agent-connections`). The agent host runs the
 * sign-in; the approved poll's answer is the one answer that holds the key
 * (Liam's option 1, HAL-17439). This class writes that key straight to the
 * keychain and passes on no key: no feature, React state or view ever sees
 * it. When the keychain write fails, the host revokes the key and forgets it,
 * and the sign-in ends as `key-not-saved`.
 */
export class HostAgentConnections implements AgentConnections {
  readonly #options: HostAgentConnectionsOptions;
  readonly #listeners = new Set<() => void>();
  /** Each listed connection's file name, by its ID, for Sign in again and Disconnect. */
  readonly #names = new Map<MessagingId, string>();

  constructor(options: HostAgentConnectionsOptions) {
    this.#options = options;
  }

  async list(): Promise<readonly AgentConnection[]> {
    const rows = await this.#options.signIn.connections();
    for (const row of rows) this.#names.set(row.id, row.name);
    return rows.map(({ id, label, address, state }) => ({
      id,
      provider: "paperclip",
      label,
      address,
      state,
    }));
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async signIn(request: {
    readonly address: string;
    readonly connection?: MessagingId;
  }): Promise<SignInStart> {
    const name = request.connection === undefined ? undefined : this.#names.get(request.connection);
    const started = await this.#options.signIn.start(request.address, name);
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
    const { tokens, host, workspace } = this.#options;
    const { revoked } = await disconnectPaperclip(tokens, host, { workspace, connection: name });
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
        return this.#keep(state);
      case "expired":
        return { outcome: "expired" };
      case "wrong-company":
        return { outcome: "refused", reason: "other-company" };
      default:
        return { outcome: "cancelled" };
    }
  }

  /** Writes the approved key to the keychain, and drops it; a failed write revokes it. */
  async #keep(
    state: Extract<PaperclipSignInState, { status: "connected" }>,
  ): Promise<SignInResult> {
    const { tokens, host, workspace } = this.#options;
    const { connection: name, key, address, company } = state;
    try {
      await tokens.set(
        paperclipKeyTokenName(name),
        paperclipKeyEntryText({ key, address, company }),
      );
    } catch (error) {
      this.#options.report(error);
      await host.disconnect({ workspace, connection: name }).catch((revokeError: unknown) => {
        this.#options.report(revokeError);
      });
      this.#changed();
      return { outcome: "key-not-saved" };
    }
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

  #now(): number {
    return this.#options.now();
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** Paperclip's sign-in keys expire after 30 days (HAL-17423). */
const keyLifetimeMs = 30 * 24 * 60 * 60 * 1000;
