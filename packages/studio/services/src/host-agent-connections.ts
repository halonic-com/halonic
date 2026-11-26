import type {
  AgentHostPaperclipSignIn,
  PaperclipConnectionList,
  PaperclipConnectionRef,
  PaperclipKeyHandOver,
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
  paperclipKeyEntryOf,
  paperclipKeyEntryText,
  paperclipKeyTokenName,
} from "./paperclip-key.ts";
import { restorePaperclipKeys, sameOrigin, sameWorkspace } from "./paperclip-restore.ts";

/** How often a waiting sign-in asks the engine whether the board approved it. */
export const signInPollMs = 2000;

/** What {@link HostAgentConnections} needs. */
export interface HostAgentConnectionsOptions {
  /** The agent host's sign-in and connection list for the open workspace. */
  readonly signIn: Pick<
    AgentHostPaperclipSignIn,
    "listed" | "start" | "poll" | "confirm" | "cancel"
  >;
  /** The agent host's hand-over, for a restored key, and its Disconnect, which revokes the key and forgets it. */
  readonly host: {
    handOver(entry: PaperclipKeyHandOver): Promise<void>;
    disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }>;
  };
  /** The keychain's tokens, where each connection's key is kept. */
  readonly tokens: Pick<TokenStore, "get" | "set" | "remove">;
  /** The open workspace's path, as Studio names it to the host. */
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
 *
 * The keychain entry names the workspaces the person signed in from, so
 * {@link HostAgentConnections.restore} can give the key back when one of them
 * opens again (`services.paperclip-restore`).
 */
export class HostAgentConnections implements AgentConnections {
  readonly #options: HostAgentConnectionsOptions;
  readonly #listeners = new Set<() => void>();
  /** Each listed connection's file name, by its ID, for Sign in again and Disconnect. */
  readonly #names = new Map<MessagingId, string>();
  /** The workspace's real path, as the host last listed it. */
  #realWorkspace: string | undefined;
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
   * Gives the host back the keys the person signed in with in this workspace,
   * once, when it opens (`services.paperclip-restore`). It never throws or
   * asks anything; a failure is reported and leaves that row as it was.
   *
   * When the host can't list the workspace's connections yet, as right after
   * a start, the restore stays pending and the next {@link list} tries it
   * again, until one listing succeeds (HAL-19027).
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
    const { tokens, host, workspace, report } = this.#options;
    const listed = async () => {
      const list = await this.#listed();
      // Listed: what happens to each row now is final, and nothing is tried again.
      this.#restorePending = false;
      return list;
    };
    const restored = await restorePaperclipKeys({ listed, tokens, host, workspace, report });
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
    // Read first, so a Sign in again that fails leaves the connection its old key (Julian, HAL-18048).
    const before = await tokens.get(tokenName).catch(failed(report));
    const workspaces =
      before === false ? [] : await this.#workspacesWith(before, { address, company });
    const entry = paperclipKeyEntryText({ key, address, company, workspaces });
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

  /** The host's list, keeping each row's file name and the workspace's real path. */
  async #listed(): Promise<PaperclipConnectionList> {
    const listed = await this.#options.signIn.listed();
    this.#realWorkspace = listed.workspace;
    for (const row of listed.connections) this.#names.set(row.id, row.name);
    return listed;
  }

  /**
   * The workspaces a new key's entry names: this one, and those the entry
   * held `before` named when it was made for the same address and company.
   * A key for another address or company starts the list again.
   */
  async #workspacesWith(
    before: string | null,
    madeFor: { address: string; company: string },
  ): Promise<string[]> {
    const here = await this.#realWorkspaceNow();
    const old = before === null ? undefined : paperclipKeyEntryOf(before);
    const sameKeyPlace =
      old !== undefined &&
      sameOrigin(old.address, madeFor.address) &&
      old.company === madeFor.company;
    const kept = sameKeyPlace ? old.workspaces : [];
    const others = kept.filter((each) => !sameWorkspace(each, here));
    return [...others, here];
  }

  /**
   * The workspace's real path: as the host last listed it, else as it lists
   * it now. When that fails, the path Studio names, which a later restore
   * may not match, so it only costs one more sign-in, never a key to a clone.
   */
  async #realWorkspaceNow(): Promise<string> {
    if (this.#realWorkspace !== undefined) return this.#realWorkspace;
    const listed = await this.#listed().catch((error: unknown) => {
      this.#options.report(error);
      return undefined;
    });
    return listed?.workspace ?? this.#options.workspace;
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
