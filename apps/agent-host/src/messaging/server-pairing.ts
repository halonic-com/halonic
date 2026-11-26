import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import type { AccessToken } from "@halonicjs/host-server";
import { type SecretStore, serverPairingSecretName } from "@halonicjs/ports";
import type { DesktopMessaging } from "./desktop-messaging.ts";
import {
  computerNamePattern,
  type MessagingEngineSetting,
  type Paired,
} from "./messaging-engine-setting.ts";
import { type KeptPairing, keptPairing, keptValue } from "./server-access.ts";
import { ServerPairingClient, type ServerReach } from "./server-pairing-client.ts";

/**
 * Where a workspace's engine stands, for Settings › Connections; never the
 * token. `computerName` is the name this computer paired as, or on "This
 * computer" its own name for the pairing dialog; `server` is what the server
 * answered the device's token just now, when the keychain held one.
 */
export type EngineState =
  | { engine: "this-computer"; computerName?: string }
  | ({
      engine: "server";
      address: string;
      pairing: "kept" | "missing" | "unreadable";
      server?: { state: ServerReach; checkedAt: string };
      /** Whether an Access service token is kept; its values never leave the host. */
      accessSet?: true;
    } & Paired);

/** What starting a pairing gave the page. */
export type PairAnswer =
  | { state: "waiting"; pairingId: string; checkCode: string; expiresAt: string }
  | { state: "too_many"; minutes?: number }
  | {
      state:
        | "address_not_allowed"
        | "unreachable"
        | "not_halonic"
        | "access_refused"
        | "code_refused"
        | "lost";
    };

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
        | "access_refused"
        | "code_refused";
    };

/** What changing the Access service token did. */
export type AccessAnswer =
  | { state: "saved"; server: ServerReach }
  | { state: "not_paired" | "key_not_saved" };

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
  /** This computer's own name; the OS's host name by default. */
  computerName?: () => string | undefined;
}

/** A pairing waiting for Allow, kept in this host's memory only. */
interface Pending {
  workspace: string;
  address: string;
  /** The name the server lists this computer as. */
  deviceName: string;
  /** The server's pending ID: whoever holds it collects the token, so the page never sees it. */
  pendingId: string;
  expiresAt: string;
  /** The Access service token typed with the address, kept in memory until Allow. */
  access: AccessToken | undefined;
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

  /**
   * The workspace's engine, whether the keychain holds its pairing, and
   * when it does, whether the server answers it now (one call, with the token
   * in its `Authorization` header only).
   */
  async state(workspace: string): Promise<EngineState> {
    const { key, engine } = await this.#options.setting.read(workspace);
    if (engine.kind === "this-computer") {
      const name = (this.#options.computerName ?? hostComputerName)();
      return { engine: "this-computer", ...(name === undefined ? {} : { computerName: name }) };
    }
    const { kind, address, ...paired } = engine;
    let kept: KeptPairing | undefined;
    let pairing: "kept" | "missing" | "unreadable";
    try {
      const value = await this.#options.keychain.get(serverPairingSecretName(key));
      if (value !== null) kept = keptPairing(value);
      pairing = kept === undefined ? "missing" : "kept";
    } catch (error) {
      this.#failed("couldn't read the pairing from the keychain", error);
      pairing = "unreadable";
    }
    const state: EngineState = { engine: "server", address, pairing, ...paired };
    if (kept === undefined) return state;
    const reach = await this.#client(address, kept.access).check(kept.token);
    return {
      ...state,
      ...(kept.access === undefined ? {} : { accessSet: true as const }),
      server: { state: reach, checkedAt: this.#now().toISOString() },
    };
  }

  /** Checks the address is a Halonic server (`GET /api/hello`), then asks it to pair. */
  async pair(
    workspace: string,
    address: string,
    code: string,
    deviceName: string,
    access?: AccessToken,
  ): Promise<PairAnswer> {
    let client: ServerPairingClient;
    try {
      client = this.#client(address, access);
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
      deviceName,
      pendingId: started.pendingId,
      expiresAt: started.expiresAt,
      access,
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
    const client = this.#client(pending.address, pending.access);
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
    const client = this.#client(pending.address, pending.access);
    return { cancelled: await client.cancel(pending.pendingId) };
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
        const value = await keychain.get(name);
        if (value !== null) {
          const { token, access } = keptPairing(value);
          stillValid = !(await this.#client(engine.address, access).signOut(token));
        }
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

  /**
   * Sets, or with `undefined` clears, the Access service token kept with the
   * workspace's device token, then asks the server once with it and answers
   * what the Access check said. Only a paired workspace has one to change.
   */
  async setAccess(workspace: string, access: AccessToken | undefined): Promise<AccessAnswer> {
    const { setting, keychain, messaging } = this.#options;
    const { key, engine } = await setting.read(workspace);
    if (engine.kind !== "server") return { state: "not_paired" };
    const name = serverPairingSecretName(key);
    try {
      const value = await keychain.get(name);
      if (value === null) return { state: "not_paired" };
      const next = keptValue({
        token: keptPairing(value).token,
        ...(access === undefined ? {} : { access }),
      });
      await keychain.set(name, next);
      if ((await keychain.get(name)) !== next) throw new PairingNotKept();
      const reach = await this.#client(engine.address, access).check(keptPairing(next).token);
      await messaging.switchEngine(workspace);
      return { state: "saved", server: reach };
    } catch (error) {
      this.#failed("couldn't change the Access service token in the keychain", error);
      return { state: "key_not_saved" };
    }
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
      const value = keptValue({
        token,
        ...(pending.access === undefined ? {} : { access: pending.access }),
      });
      await keychain.set(name, value);
      if ((await keychain.get(name)) !== value) throw new PairingNotKept();
      await setting.useServer(pending.workspace, pending.address, {
        computerName: pending.deviceName,
        sessionEndsAt,
      });
    } catch (error) {
      this.#failed("couldn't keep the new pairing, so it ends it on the server", error);
      if (name !== undefined) await keychain.remove(name).catch(() => undefined);
      return { state: "key_not_saved", signedOut: await client.signOut(token) };
    }
    await messaging.switchEngine(pending.workspace);
    return { state: "paired", sessionEndsAt };
  }

  #now(): Date {
    return this.#options.now?.() ?? new Date();
  }

  #keepPending(pairingId: string, pending: Pending): void {
    const now = this.#now().getTime();
    for (const [id, each] of this.#pending) {
      if (Date.parse(each.expiresAt) <= now) this.#pending.delete(id);
    }
    const oldest = this.#pending.keys().next();
    if (this.#pending.size >= maxPending && oldest.done !== true)
      this.#pending.delete(oldest.value);
    this.#pending.set(pairingId, pending);
  }

  #client(address: string, access?: AccessToken): ServerPairingClient {
    return new ServerPairingClient(address, this.#options.fetch, access);
  }

  /** Logs the error's name only: a keychain's or the platform's message may hold the token. */
  #failed(doing: string, error: unknown): void {
    const named = error instanceof Error ? error.name : "Error";
    const name = /^\w{1,40}$/.test(named) ? named : "Error";
    this.#options.log(`Server engine: the host ${doing} (${name}).\n`);
  }
}

/**
 * This computer's name as the pairing dialog fills it in: the OS's host
 * name without a trailing `.local`, or `undefined` when that isn't a name
 * the server would take.
 */
export function hostComputerName(name: string = hostname()): string | undefined {
  const plain = name.replace(/\.local\.?$/i, "").trim();
  return computerNamePattern.test(plain) ? plain : undefined;
}

/** The keychain gave back something else than the token it was given. */
class PairingNotKept extends Error {
  override name = "PairingNotKept";
}
