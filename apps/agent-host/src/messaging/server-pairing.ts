import { randomBytes } from "node:crypto";
import { type SecretStore, serverPairingSecretName } from "@halonicjs/ports";
import type { DesktopMessaging } from "./desktop-messaging.ts";
import type { MessagingEngineSetting } from "./messaging-engine-setting.ts";
import { ServerPairingClient } from "./server-pairing-client.ts";

/** Where a workspace's engine stands, for Settings › Connections; never the token. */
export type EngineState =
  | { engine: "this-computer" }
  | { engine: "server"; address: string; pairing: "kept" | "missing" | "unreadable" };

/** What starting a pairing gave the page. */
export type PairAnswer =
  | { state: "waiting"; pairingId: string; checkCode: string; expiresAt: string }
  | { state: "too_many"; minutes?: number }
  | { state: "address_not_allowed" | "unreachable" | "not_halonic" | "code_refused" | "lost" };

/** Where a pairing stands for the page. Only `paired` changed the setting. */
export type PairStatusAnswer =
  | { state: "waiting"; expiresAt: string }
  | { state: "paired"; sessionEndsAt: string }
  | { state: "key_not_saved"; signedOut: boolean }
  | { state: "too_many"; minutes?: number }
  | {
      state:
        | "expired"
        | "refused"
        | "cancelled"
        | "taken-over"
        | "lost"
        | "unreachable"
        | "not_halonic"
        | "code_refused";
    };

/** What switching back to "This computer" did; the setting is gone either way. */
export interface ThisComputerAnswer {
  /** The session on the server may still work: it couldn't be ended from here. */
  stillValid: boolean;
  /** The keychain didn't delete the entry, so the token is still in it. */
  keychainEntryKept?: true;
}

/** What the pairing works with. */
export interface ServerEnginePairingOptions {
  messaging: DesktopMessaging;
  setting: MessagingEngineSetting;
  /** The host's own secrets in the OS keychain; the device token goes nowhere else. */
  keychain: SecretStore;
  /** Where the host writes what failed: an error's name at most, never its text. */
  log: (text: string) => void;
  /** The `fetch` the server is called with; the global one by default. */
  fetch?: typeof fetch;
  now?: () => Date;
}

/** A pairing waiting for Allow, kept in this host's memory only. */
interface Pending {
  workspace: string;
  address: string;
  /** The server's pending ID: whoever holds it collects the token, so the page never sees it. */
  pendingId: string;
  expiresAt: string;
}

/** At most this many pairings wait at once; a new one drops the oldest. */
const maxPending = 8;

/**
 * Pairs a workspace's messaging with a Halonic server
 * (`agent-host.server-engine-pairing`). The host makes every call to the
 * server and puts the device token straight into the keychain: the page gets
 * the check code, the ending and the dates, never the token nor the server's
 * pending ID. The setting changes to "Server" only once the keychain gave the
 * token back.
 */
export class ServerEnginePairing {
  readonly #options: ServerEnginePairingOptions;
  readonly #pending = new Map<string, Pending>();

  constructor(options: ServerEnginePairingOptions) {
    this.#options = options;
  }

  /** The workspace's engine, and whether the keychain holds its pairing. */
  async state(workspace: string): Promise<EngineState> {
    const { key, engine } = await this.#options.setting.read(workspace);
    if (engine.kind === "this-computer") return { engine: "this-computer" };
    let pairing: "kept" | "missing" | "unreadable";
    try {
      const token = await this.#options.keychain.get(serverPairingSecretName(key));
      pairing = token === null ? "missing" : "kept";
    } catch (error) {
      this.#failed("couldn't read the pairing from the keychain", error);
      pairing = "unreadable";
    }
    return { engine: "server", address: engine.address, pairing };
  }

  /** Checks the address is a Halonic server (`GET /api/hello`), then asks it to pair. */
  async pair(
    workspace: string,
    address: string,
    code: string,
    deviceName: string,
  ): Promise<PairAnswer> {
    let client: ServerPairingClient;
    try {
      client = this.#client(address);
    } catch {
      return { state: "address_not_allowed" };
    }
    const hello = await client.hello();
    if (hello !== "halonic") return { state: hello };
    const started = await client.pair(code, deviceName);
    if (started.kind !== "pending") {
      const { kind, ...rest } = started;
      return { state: kind, ...rest } as PairAnswer;
    }
    const pairingId = randomBytes(16).toString("hex");
    this.#keepPending(pairingId, {
      workspace,
      address: client.origin,
      pendingId: started.pendingId,
      expiresAt: started.expiresAt,
    });
    const { checkCode, expiresAt } = started;
    return { state: "waiting", pairingId, checkCode, expiresAt };
  }

  /**
   * Asks the server once. On Allow, the token goes to the keychain and is
   * read back; only then is the setting saved and the hub switched. When any
   * of that fails, the session is ended on the server and nothing is kept.
   */
  async status(pairingId: string): Promise<PairStatusAnswer> {
    const pending = this.#pending.get(pairingId);
    if (pending === undefined) return { state: "lost" };
    const client = this.#client(pending.address);
    const poll = await client.status(pending.pendingId);
    switch (poll.kind) {
      case "waiting":
        return { state: "waiting", expiresAt: poll.expiresAt };
      case "unreachable":
      case "too_many": {
        // The server may answer on the next poll; the page stops at the code's end.
        const { kind, ...rest } = poll;
        return { state: kind, ...rest };
      }
      case "allowed":
        this.#pending.delete(pairingId);
        return this.#keep(pending, client, poll.token, poll.sessionEndsAt);
      default:
        this.#pending.delete(pairingId);
        return { state: poll.kind };
    }
  }

  /** Asks the server to drop the request; whether it did, or had none. */
  async cancel(pairingId: string): Promise<{ cancelled: boolean }> {
    const pending = this.#pending.get(pairingId);
    if (pending === undefined) return { cancelled: true };
    this.#pending.delete(pairingId);
    return { cancelled: await this.#client(pending.address).cancel(pending.pendingId) };
  }

  /**
   * Back to "This computer": ends the session on the server when it can,
   * deletes the token and the workspace's messaging cache, and removes the
   * setting even when the token couldn't be read or deleted.
   */
  async useThisComputer(workspace: string): Promise<ThisComputerAnswer> {
    const { setting, keychain, messaging } = this.#options;
    const { key, engine } = await setting.read(workspace);
    const name = serverPairingSecretName(key);
    let stillValid = false;
    if (engine.kind === "server") {
      try {
        const token = await keychain.get(name);
        if (token !== null) stillValid = !(await this.#client(engine.address).signOut(token));
      } catch (error) {
        this.#failed("couldn't read the pairing from the keychain to end it", error);
        stillValid = true;
      }
    }
    let keychainEntryKept = false;
    try {
      await keychain.remove(name);
    } catch (error) {
      this.#failed("couldn't delete the pairing from the keychain", error);
      keychainEntryKept = true;
    }
    await setting.useThisComputer(workspace);
    await messaging.leaveServer(workspace);
    return keychainEntryKept ? { stillValid, keychainEntryKept } : { stillValid };
  }

  async #keep(
    pending: Pending,
    client: ServerPairingClient,
    token: string,
    sessionEndsAt: string,
  ): Promise<PairStatusAnswer> {
    const { setting, keychain, messaging } = this.#options;
    let name: string | undefined;
    try {
      name = serverPairingSecretName(await setting.keyOf(pending.workspace));
      await keychain.set(name, token);
      if ((await keychain.get(name)) !== token) throw new PairingNotKept();
      await setting.useServer(pending.workspace, pending.address);
    } catch (error) {
      this.#failed("couldn't keep the new pairing, so it ends it on the server", error);
      if (name !== undefined) await keychain.remove(name).catch(() => undefined);
      return { state: "key_not_saved", signedOut: await client.signOut(token) };
    }
    await messaging.switchEngine(pending.workspace);
    return { state: "paired", sessionEndsAt };
  }

  #keepPending(pairingId: string, pending: Pending): void {
    const now = (this.#options.now?.() ?? new Date()).getTime();
    for (const [id, each] of this.#pending) {
      if (Date.parse(each.expiresAt) <= now) this.#pending.delete(id);
    }
    const oldest = this.#pending.keys().next();
    if (this.#pending.size >= maxPending && oldest.done !== true)
      this.#pending.delete(oldest.value);
    this.#pending.set(pairingId, pending);
  }

  #client(address: string): ServerPairingClient {
    return new ServerPairingClient(address, this.#options.fetch);
  }

  /** Logs the error's name only: a keychain's or the platform's message may hold the token. */
  #failed(doing: string, error: unknown): void {
    const named = error instanceof Error ? error.name : "Error";
    const name = /^\w{1,40}$/.test(named) ? named : "Error";
    this.#options.log(`Server engine: the host ${doing} (${name}).\n`);
  }
}

/** The keychain gave back something else than the token it was given. */
class PairingNotKept extends Error {
  override name = "PairingNotKept";
}
