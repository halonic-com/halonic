// The server engine's Paperclip sign-in and Disconnect (`server.paperclip-sign-in`, HAL-17512
// S5): the same CLI sign-in as the desktop host's, except that the approved key goes into the
// serve profile's secret store, never to Studio.

import { join } from "node:path";
import { MessagingCacheFolder } from "@halonicjs/adapter-agent-messaging-cache";
import {
  approvalPageUrl,
  newSignInPhrase,
  PaperclipSignInClient,
  paperclipSourceId,
  type SignInChallengeRef,
  signInClientName,
} from "@halonicjs/adapter-paperclip-client";
import { paperclipOrigin } from "@halonicjs/host-agent-messaging-hub";
import type {
  PaperclipDisconnected,
  PaperclipKeyPorts,
  PaperclipSignInRequest,
  PaperclipSignInStart,
  PaperclipSignInState,
} from "@halonicjs/host-server";
import type { SecretStore } from "@halonicjs/ports";
import { plainText } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";
import {
  connectionNames,
  openServeMessaging,
  paperclipKeySecretName,
  readConnectionFile,
  readStoredKey,
  type ServeMessaging,
} from "./serve-messaging.ts";

/** How long a sign-in lasts: Paperclip's challenge lifetime (HAL-17423), as on the desktop. */
export const serveSignInLimitMs = 10 * 60 * 1000;

/** What {@link ServePaperclipSignIn} needs. */
export interface ServePaperclipSignInOptions {
  /** The engine workspace's real path; a sign-in is only for one of its connection files. */
  workspace: string;
  /** The serve profile's own secrets file, where the approved key is kept. */
  keys: Pick<SecretStore, "get" | "set" | "remove">;
  /** The messaging cache's folder, in the profile; Disconnect deletes the source's part of it. */
  cacheFolder: string;
  /** Says which cache file was broken and read as missing. */
  warn: (message: string) => void;
  /** Hears a failure the flow carries on past, such as a failed revoke; never a key. */
  report: (error: unknown) => void;
  /** The `fetch` the sign-in sends with; the global one by default. */
  fetch?: typeof fetch;
  now?: () => Date;
  /** Runs `end` after `ms`; tests pass their own. By default a timer that doesn't keep `serve` running. */
  setTimer?: (ms: number, end: () => void) => void;
  /** Makes the phrase; tests may pass a fixed one. */
  newPhrase?: () => string;
}

/** What {@link openServePaperclip} needs. */
export interface ServePaperclipOptions {
  /** The engine workspace's real path. */
  workspace: string;
  /** The serve profile's own secrets file, the only place a Paperclip key is kept. */
  keys: Pick<SecretStore, "get" | "set" | "remove">;
  /** The serve profile's folder; the messaging cache goes in it. */
  profileFolder: string;
  /** Where failures and broken cache files are written; never a key. */
  log: (failure: unknown) => void;
  /** The `fetch` Paperclip is called with; the global one by default. */
  fetch?: typeof fetch;
}

/** The server's messaging over the stored keys (S4), and the sign-in that stores them. */
export async function openServePaperclip(
  options: ServePaperclipOptions,
): Promise<ServeMessaging & { signIn: ServePaperclipSignIn }> {
  const { workspace, keys, log } = options;
  const cacheFolder = join(options.profileFolder, "agent-messaging-cache");
  const network = options.fetch === undefined ? {} : { fetch: options.fetch };
  const opened = await openServeMessaging({
    workspace,
    keys,
    cacheFolder,
    report: (failure) => log(failure.error),
    warn: log,
    ...network,
  });
  const signIn = new ServePaperclipSignIn({
    workspace,
    keys,
    cacheFolder,
    warn: log,
    report: log,
    ...network,
  });
  return { ...opened, signIn };
}

/** A sign-in waiting for the board's approval. */
interface OpenSignIn {
  connection: string;
  address: string;
  company: string;
  calls: PaperclipSignInClient;
  challenge: SignInChallengeRef;
  /** The board key, held only here until the poll that sees `approved` stores it. */
  key: string;
  deadline: number;
  /** Whether a poll is waiting for Paperclip's answer. */
  polling: boolean;
}

/**
 * Paperclip sign-in on the server. A sign-in is for a connection file the engine workspace
 * already has: the server never writes into the workspace. The key Paperclip hands back at
 * the start stays in this object's memory only, until a poll sees the approval and stores it
 * in the secret store, or the sign-in is cancelled or expires and it is dropped.
 */
export class ServePaperclipSignIn implements PaperclipKeyPorts {
  readonly #options: ServePaperclipSignInOptions;
  readonly #open = new Map<string, OpenSignIn>();

  constructor(options: ServePaperclipSignInOptions) {
    this.#options = options;
  }

  async start(request: PaperclipSignInRequest): Promise<PaperclipSignInStart> {
    const address = paperclipOrigin(request.address);
    const file =
      address === undefined
        ? undefined
        : await connectionFor(this.#options.workspace, address, request.connection);
    if (address === undefined || file === undefined) {
      return { outcome: "refused", reason: "address-not-allowed" };
    }
    const phrase = (this.#options.newPhrase ?? newSignInPhrase)();
    const calls = this.#client(address);
    let created: Awaited<ReturnType<PaperclipSignInClient["createChallenge"]>>;
    try {
      created = await calls.createChallenge({
        command: phrase,
        clientName: signInClientName,
        requestedAccess: "board",
        requestedCompanyId: file.company,
      });
    } catch (error) {
      this.#options.report(error);
      return { outcome: "refused", reason: "unreachable" };
    }
    const signInId = crypto.randomUUID();
    const deadline = this.#now() + serveSignInLimitMs;
    const open: OpenSignIn = {
      ...file,
      address,
      calls,
      challenge: { id: created.id, token: created.token },
      key: created.boardApiToken,
      deadline,
      polling: false,
    };
    let approvalUrl: string;
    try {
      approvalUrl = approvalPageUrl(address, created.approvalPath);
    } catch (error) {
      // Without a page on the connection's own address the sign-in can't go on: drop the key.
      await end(open, "cancelled");
      throw error;
    }
    this.#open.set(signInId, open);
    this.#setTimer(serveSignInLimitMs, () => {
      this.#expire(signInId).catch(this.#options.report);
    });
    return { outcome: "started", signInId, phrase, approvalUrl, expiresAt: isoTime(deadline) };
  }

  async poll(signInId: string): Promise<PaperclipSignInState> {
    const open = this.#open.get(signInId);
    if (open === undefined) return { status: "unknown" };
    if (this.#now() >= open.deadline) return this.#expire(signInId);
    // One poll at a time, so two answers can't store or revoke the same key twice.
    if (open.polling) return { status: "pending" };
    open.polling = true;
    let status: Awaited<ReturnType<PaperclipSignInClient["pollChallenge"]>>;
    try {
      status = await open.calls.pollChallenge(open.challenge);
    } finally {
      open.polling = false;
    }
    if (status === "pending") return { status: "pending" };
    // Whoever takes a sign-in out owns its key: a cancel or time-out that took it first ended it.
    if (this.#take(signInId) !== open) return { status: "cancelled" };
    return status === "approved" ? this.#store(open) : { status };
  }

  async cancel(signInId: string): Promise<PaperclipSignInState> {
    const open = this.#take(signInId);
    return open === undefined ? { status: "unknown" } : end(open, "cancelled");
  }

  /**
   * Revokes the stored key with `revoke-current` at the address it was made for, then deletes
   * the record and the source's cache, also when the revoke failed: the answer then says so,
   * and Studio says the key stays valid until it expires.
   */
  async disconnect(connection: string): Promise<PaperclipDisconnected> {
    const { keys, report } = this.#options;
    const name = paperclipKeySecretName(connection);
    if ((await keys.get(name)) === null) return { outcome: "unknown" };
    const stored = await readStoredKey(keys, connection);
    const revoked =
      stored !== undefined &&
      (await this.#client(stored.address)
        .revokeCurrent(stored.key)
        .then(
          () => true,
          (error: unknown) => {
            report(error);
            return false;
          },
        ));
    await keys.remove(name);
    await this.#cache().clear(paperclipSourceId(connection));
    return { outcome: "disconnected", revoked };
  }

  /**
   * Stores an approved key when its user belongs to the connection file's company; else
   * revokes it. A key that replaces an older one gets the older one revoked: nobody holds it.
   */
  async #store(open: OpenSignIn): Promise<PaperclipSignInState> {
    const { keys } = this.#options;
    const { calls, connection, address, company, key } = open;
    const owner = await revokeOnFailure(open, () => calls.readMe(key));
    // Outside revokeOnFailure, so a failed revoke is reported once and not tried again.
    if (!owner.companyIds.includes(company)) return refuseKey(open);
    const before = await revokeOnFailure(open, async () => {
      const stored = await readStoredKey(keys, connection);
      await keys.set(paperclipKeySecretName(connection), JSON.stringify({ key, address, company }));
      return stored;
    });
    if (before !== undefined && before.key !== key) {
      await this.#client(before.address).revokeCurrent(before.key).catch(this.#options.report);
    }
    return { status: "connected", connection, address, company };
  }

  async #expire(signInId: string): Promise<PaperclipSignInState> {
    const open = this.#take(signInId);
    return open === undefined ? { status: "unknown" } : end(open, "expired");
  }

  /** Takes a sign-in out of memory, at once and without waiting, so only one caller gets it. */
  #take(signInId: string): OpenSignIn | undefined {
    const open = this.#open.get(signInId);
    this.#open.delete(signInId);
    return open;
  }

  #client(address: string): PaperclipSignInClient {
    const { fetch } = this.#options;
    return new PaperclipSignInClient({ address, ...(fetch === undefined ? {} : { fetch }) });
  }

  #cache(): MessagingCacheFolder {
    const { cacheFolder, workspace, warn } = this.#options;
    return new MessagingCacheFolder(cacheFolder, [workspace], warn);
  }

  #now(): number {
    return (this.#options.now?.() ?? new Date()).getTime();
  }

  #setTimer(ms: number, run: () => void): void {
    if (this.#options.setTimer !== undefined) this.#options.setTimer(ms, run);
    else setTimeout(run, ms).unref();
  }
}

/** The connection file a sign-in is for: the named one, or the first with this address. */
async function connectionFor(
  workspace: string,
  address: string,
  name: string | undefined,
): Promise<{ connection: string; company: string } | undefined> {
  const names = name === undefined ? await connectionNames(workspace) : [name];
  for (const connection of names) {
    const file = await readConnectionFile(workspace, connection);
    if (file !== undefined && paperclipOrigin(file.address) === address) {
      return { connection, company: file.company };
    }
  }
  return undefined;
}

/** Revokes a key whose user isn't in the connection's company; nothing is stored. */
async function refuseKey(open: OpenSignIn): Promise<PaperclipSignInState> {
  await open.calls.revokeCurrent(open.key);
  return { status: "wrong-company" };
}

/**
 * Ends a sign-in taken out of memory: cancels its challenge, and revokes the key when the board
 * approved it first. When Paperclip can't say how the challenge ended, the key is revoked
 * instead, and when that fails too, the answer says the key may work.
 */
async function end(
  open: OpenSignIn,
  status: "cancelled" | "expired",
): Promise<PaperclipSignInState> {
  const { calls, challenge, key } = open;
  try {
    if ((await calls.cancelChallenge(challenge)) === "approved") await calls.revokeCurrent(key);
    return { status };
  } catch {
    const revoked = await calls.revokeCurrent(key).then(
      () => true,
      () => false,
    );
    return revoked ? { status } : { status, keyMayWork: true };
  }
}

/**
 * Runs `work` on an approved sign-in. When it fails, the key works but isn't stored: it is
 * revoked, so no working key is left anywhere, and when that fails too, both errors are thrown.
 */
async function revokeOnFailure<T>(open: OpenSignIn, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    try {
      await open.calls.revokeCurrent(open.key);
    } catch (revokeError) {
      throw new AggregateError(
        [cause, revokeError],
        plainText(serveMessages.paperclipKeyNotRevoked().phrase),
      );
    }
    throw cause;
  }
}

function isoTime(time: number): string {
  return new Date(time).toISOString();
}
