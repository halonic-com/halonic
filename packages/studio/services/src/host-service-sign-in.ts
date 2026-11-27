import {
  AgentHostError,
  type PaperclipConnectionList,
  type PaperclipConnectionRow,
} from "@halonicjs/adapter-agent-host-client";
import type {
  ActionAccount,
  ServiceSignIn,
  SignInConnection,
  SignInConnectionRef,
  SignInEnd,
  SignInRevoke,
  SignInStart,
} from "@halonicjs/ports";
import {
  type AgentConnection,
  type AgentConnections,
  type SignInRefusal as ConnectionRefusal,
  type DisconnectResult,
  type SignInChallenge,
  type SignInResult,
  signInLimitMs,
} from "./agent-connections.ts";

/** What {@link HostServiceSignIn} needs. */
export interface HostServiceSignInOptions {
  /** The workspace's connection files, from the agent host; never a key. */
  readonly listed: () => Promise<PaperclipConnectionList>;
  /** The sign-in and Disconnect that Settings › Connections uses: a `HostAgentConnections`. */
  readonly connections: Pick<AgentConnections, "list" | "signIn" | "disconnect">;
  /**
   * Whether the shell's keychain holds an entry for the connection, by its file's name: one bit,
   * never the key (`agent_host_paperclip_key_kept`). The entry is per connection name, so it may
   * be one signed in from another workspace that the agent host doesn't hold.
   */
  readonly keyKept: (connection: string) => Promise<boolean>;
  /** The time now, in milliseconds; tests pass a clock of their own. */
  readonly now: () => number;
  /** Hears a failure nobody else is told about, such as a revoke after a close that failed. */
  readonly report: (error: unknown) => void;
}

/** A sign-in this Studio started, by its ID. */
interface StartedSignIn {
  readonly row: PaperclipConnectionRow;
  readonly test: boolean;
  readonly challenge: SignInChallenge;
  /** Whether it ended signed in and its key is still kept. */
  signedIn: boolean;
  /** The Disconnect that forgets its key, once one has started: it runs once. */
  forgotten?: Promise<void>;
}

/**
 * Studio's {@link ServiceSignIn} (`services.service-sign-in`): the
 * stepper's Paperclip sign-in over the one Settings › Connections uses, so it
 * sends no request of its own and its key goes from the agent host straight
 * to the keychain. It checks the request's host against the connection file,
 * and the approval page against the file's address, before the stepper can
 * open anything (Liam's condition 2 on HAL-17545). A close that comes after
 * the keychain write disconnects the connection again, so a closed stepper
 * keeps no key at any point of the race (condition 3).
 */
export class HostServiceSignIn implements ServiceSignIn {
  readonly #options: HostServiceSignInOptions;
  readonly #started = new Map<string, StartedSignIn>();
  #count = 0;

  constructor(options: HostServiceSignInOptions) {
    this.#options = options;
  }

  async connection(ref: SignInConnectionRef): Promise<SignInConnection | undefined> {
    const row = await this.#row(ref.connection);
    return row === undefined ? undefined : { address: row.address, company: row.company };
  }

  async start(ref: SignInConnectionRef, options: { test: boolean }): Promise<SignInStart> {
    const { connections, now } = this.#options;
    const row = await this.#row(ref.connection);
    if (row === undefined) return refused("no-connection");
    if (originOf(row.address) !== `https://${ref.host}`) return refused("other-host");
    const kept = await this.#options.keyKept(row.name).then(
      (answer) => answer,
      (error: unknown) => {
        this.#options.report(error);
        return undefined;
      },
    );
    // Without the shell's answer, a sign-in could write over a key it can't see.
    if (kept === undefined) return refused("unreachable");
    if (replacesKey(row, kept, options.test)) return refused("already-signed-in");
    // The sign-in names the connection by its listed ID, which the list call keeps.
    await connections.list();
    const startedAt = now();
    const started = await connections.signIn({ address: row.address, connection: row.id });
    if (started.outcome === "refused") return refused(refusalOf(started.reason));
    const { challenge } = started;
    const approvalUrl = approvalPageOf(row.address, challenge.approvalUrl);
    if (approvalUrl === undefined) {
      await challenge.cancel();
      return refused("other-host");
    }
    this.#count += 1;
    const signInId = `${row.name}-${this.#count}`;
    this.#started.set(signInId, { row, test: options.test, challenge, signedIn: false });
    // A wrong expiry from the host can't stretch the 10 minutes (condition 4).
    const expiresAt = Math.min(Date.parse(challenge.expiresAt), startedAt + signInLimitMs);
    return {
      outcome: "started",
      signInId,
      code: challenge.phrase,
      approvalUrl,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async follow(signInId: string, signal: AbortSignal): Promise<SignInEnd> {
    const started = this.#started.get(signInId);
    if (started === undefined) return { outcome: "cancelled" };
    const cancel = () => void started.challenge.cancel().catch(this.#options.report);
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    const result = await started.challenge.result;
    signal.removeEventListener("abort", cancel);
    if (signal.aborted) {
      this.#started.delete(signInId);
      // Closed after the keychain write: the key goes again, revoked and deleted.
      if (result.outcome === "connected") await this.#forget(started);
      return { outcome: "cancelled" };
    }
    const end = this.#endOf(started, result);
    // Only a kept test key is needed again, by `revokeTest`; every other sign-in has ended.
    if (end.outcome !== "signed-in" || !started.test) this.#started.delete(signInId);
    return end;
  }

  async cancel(signInId: string): Promise<void> {
    const started = this.#started.get(signInId);
    if (started === undefined) return;
    this.#started.delete(signInId);
    await started.challenge.cancel();
    // An approval the cancel came too late for still leaves no key.
    if ((await started.challenge.result).outcome === "connected") await this.#forget(started);
  }

  async whoAmI(ref: SignInConnectionRef): Promise<ActionAccount | undefined> {
    const row = await this.#row(ref.connection);
    return row === undefined ? undefined : accountOf(row);
  }

  async revokeTest(signInId: string): Promise<SignInRevoke> {
    const started = this.#started.get(signInId);
    if (started === undefined || !started.test || !started.signedIn) {
      return { outcome: "not-a-test" };
    }
    started.signedIn = false;
    this.#started.delete(signInId);
    let disconnected: DisconnectResult;
    try {
      disconnected = await this.#options.connections.disconnect(started.row.id);
    } catch (error) {
      return this.#revokeFailed(error);
    }
    const after = await this.#row(started.row.name);
    const refused = after === undefined || accountOf(after) === undefined;
    return disconnected.revoked && refused ? { outcome: "revoked" } : { outcome: "still-works" };
  }

  #endOf(started: StartedSignIn, result: SignInResult): SignInEnd {
    switch (result.outcome) {
      case "connected":
        started.signedIn = true;
        return { outcome: "signed-in", account: connectedAccount(result.connection) };
      case "expired":
        return { outcome: "expired" };
      case "refused":
        return { outcome: "wrong-company" };
      default:
        return { outcome: "cancelled" };
    }
  }

  /**
   * What a test revoke whose Disconnect failed answers. The shell deletes the keychain entry even
   * when Paperclip can't be asked; when the delete itself failed, this computer may still keep the
   * key, and Disconnect in Settings › Connections tries again.
   */
  #revokeFailed(error: unknown): SignInRevoke {
    if (error instanceof AgentHostError && error.kind === "keychain") {
      this.#options.report(
        new Error("The test key's keychain entry couldn't be deleted.", { cause: error }),
      );
      return { outcome: "still-works" };
    }
    this.#options.report(error);
    return { outcome: "unreachable" };
  }

  /**
   * Revokes and deletes a key the stepper must not keep, once: a late approval reaches it from both
   * the cancel and the follow. A failure is reported, the entry still goes.
   */
  #forget(started: StartedSignIn): Promise<void> {
    started.signedIn = false;
    started.forgotten ??= this.#options.connections
      .disconnect(started.row.id)
      .then(() => undefined, this.#options.report);
    return started.forgotten;
  }

  async #row(name: string): Promise<PaperclipConnectionRow | undefined> {
    const { connections } = await this.#options.listed();
    return connections.find((row) => row.name === name);
  }
}

/**
 * Whether `url` is the approval page of a sign-in at `address`: `https`, on
 * exactly the address's origin, at `/cli-auth/<id>`. The same rule the agent
 * host's `approvalPageUrl` builds the page by, checked again here because the
 * stepper opens it; that function's package uses Node, so Studio can't load it.
 */
export function isApprovalPage(address: string, url: string): boolean {
  return approvalPageOf(address, url) !== undefined;
}

/**
 * The approval page `url` as parsed, when {@link isApprovalPage} holds: the stepper opens the
 * address that was checked, not the text it was read from.
 */
function approvalPageOf(address: string, url: string): string | undefined {
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return undefined;
  }
  const isPage =
    page.protocol === "https:" &&
    page.origin === originOf(address) &&
    page.username === "" &&
    page.password === "" &&
    /^\/cli-auth\/[A-Za-z0-9_-]+$/.test(page.pathname);
  return isPage ? page.href : undefined;
}

/**
 * Whether a sign-in for `row` would write over a key: one the shell keeps (`kept`) or the agent
 * host holds. A test may only ever revoke the key it made itself (condition 1), so it starts only
 * where there is none. Any other sign-in may replace only a key Paperclip no longer takes
 * (`signed-out`): a key it still takes would lose its only copy here without being revoked.
 */
function replacesKey(row: PaperclipConnectionRow, kept: boolean, test: boolean): boolean {
  if (!test && row.state.kind === "signed-out") return false;
  return kept || row.state.kind !== "no-key";
}

function originOf(address: string): string | undefined {
  try {
    return new URL(address).origin;
  } catch {
    return undefined;
  }
}

/** Who a listed connection signs in as; nobody once it has no key or Paperclip refused it. */
function accountOf(row: PaperclipConnectionRow): ActionAccount | undefined {
  if (row.state.kind === "no-key" || row.state.kind === "signed-out") return undefined;
  return { service: "paperclip", name: row.userName ?? row.label };
}

function connectedAccount(connection: AgentConnection): ActionAccount {
  return { service: "paperclip", name: connection.userName ?? connection.label };
}

/** The port's word for the host's refusal: an address it may not sign in to is another host. */
function refusalOf(
  reason: ConnectionRefusal,
): Extract<SignInStart, { outcome: "refused" }>["reason"] {
  if (reason === "unreachable" || reason === "too-many-sign-ins") return reason;
  return "other-host";
}

function refused(reason: Extract<SignInStart, { outcome: "refused" }>["reason"]): SignInStart {
  return { outcome: "refused", reason };
}
