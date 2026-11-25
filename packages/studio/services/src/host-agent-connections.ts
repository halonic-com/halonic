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
  readonly signIn: Pick<
    AgentHostPaperclipSignIn,
    "connections" | "start" | "poll" | "confirm" | "cancel"
  >;
  /** The agent host's Disconnect, which revokes the key and forgets it. */
  readonly host: {
    disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }>;
  };
  /** The keychain's tokens, where each connection's key is kept. */
  readonly tokens: Pick<TokenStore, "get" | "set" | "remove">;
  /** The open workspace's real path. */
  readonly workspace: string;
  /** Waits between two polls: a timer in the app; tests pass one they move on themselves. */
  readonly wait: (ms: number) => Promise<void>;
  /** The time now, in milliseconds; tests pass a clock of their own. */
  readonly now: () => number;
  /** Hears a failure nobody else is told about, such as a failed keychain write or cancel. */
  readonly report: (error: unknown) => void;
}

/**
 * The desktop engine's connections, as Settings › Connections and the Connect
 * dialog use them (`services.agent-connections`). The agent host runs the
 * sign-in; the approved poll's answer is the one answer that holds the key
 * (Liam's option 1, HAL-17439). This class writes that key straight to the
 * keychain and passes on no key: no feature, React state or view ever sees
 * it, then confirms the write to the host. A confirm whose answer got lost
 * is sent once more; the host answers a repeated confirm the same way. When
 * the write or the confirm fails, it puts back the keychain entry held
 * before, if any, and cancels the sign-in, so the host revokes the new key
 * and puts back its old one, and the sign-in ends as `key-not-saved`.
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
    return rows.map(({ id, label, address, state, userName }) => ({
      id,
      provider: "paperclip",
      label,
      address,
      state,
      ...(userName === undefined ? {} : { userName }),
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
      const result = await this.#resultOf(signInId, state);
      if (result !== undefined) return result;
    }
  }

  /** The sign-in's end, or `undefined` while it waits. */
  async #resultOf(
    signInId: string,
    state: PaperclipSignInState,
  ): Promise<SignInResult | undefined> {
    switch (state.status) {
      case "pending":
        return undefined;
      case "connected":
        return this.#keep(signInId, state);
      case "expired":
        return { outcome: "expired" };
      case "wrong-company":
        return { outcome: "refused", reason: "other-company" };
      default:
        return { outcome: "cancelled" };
    }
  }

  /** Writes the approved key to the keychain, and drops it; a failed write or confirm revokes it. */
  async #keep(
    signInId: string,
    state: Extract<PaperclipSignInState, { status: "connected" }>,
  ): Promise<SignInResult> {
    const { tokens, signIn, report } = this.#options;
    const { connection: name, key, address, company } = state;
    const tokenName = paperclipKeyTokenName(name);
    const entry = paperclipKeyEntryText({ key, address, company });
    // Read first, so a Sign in again that fails leaves the connection its old key (Julian, HAL-18048).
    const before = await tokens.get(tokenName).catch(failed(report));
    const written =
      before !== false && (await tokens.set(tokenName, entry).then(() => true, failed(report)));
    const confirmed = written && (await this.#confirm(signInId));
    if (!confirmed) {
      // The host revokes a key it has no confirm for, so the keychain keeps no dead key.
      if (written) await putBack(tokens, tokenName, before).catch(report);
      await signIn.cancel(signInId).catch(report);
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

  /**
   * Confirms the keychain write to the host. A confirm that failed is sent
   * once more, as its answer may have been lost after the host took it.
   */
  async #confirm(signInId: string): Promise<boolean> {
    const { signIn, report } = this.#options;
    const first = await signIn.confirm(signInId).catch((error: unknown) => {
      report(error);
      return undefined;
    });
    if (first !== undefined) return first;
    return await signIn.confirm(signInId).catch(failed(report));
  }

  #now(): number {
    return this.#options.now();
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** Reports a failure and answers `false`, for a step whose failure ends the sign-in. */
function failed(report: (error: unknown) => void): (error: unknown) => false {
  return (error) => {
    report(error);
    return false;
  };
}

/** Puts the keychain entry held before back, or removes the new one when there was none. */
async function putBack(
  tokens: Pick<TokenStore, "set" | "remove">,
  tokenName: string,
  before: string | null,
): Promise<void> {
  if (before === null) await tokens.remove(tokenName);
  else await tokens.set(tokenName, before);
}

/** Paperclip's sign-in keys expire after 30 days (HAL-17423). */
const keyLifetimeMs = 30 * 24 * 60 * 60 * 1000;
