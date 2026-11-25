import {
  approvalPageUrl,
  newSignInPhrase,
  signInClientName,
} from "@halonicjs/adapter-paperclip-client";
import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";
import type {
  ChallengeRef,
  ChallengeStatus,
  PaperclipKeyStore,
  SavedKey,
  SignInCalls,
  StoredPaperclipKey,
} from "./sign-in-calls.ts";

/** How long a sign-in lasts: Paperclip's challenge lifetime (HAL-17423). */
export const signInLimitMs = 10 * 60 * 1000;

/**
 * How long the host waits, after the key is saved, for Studio to confirm the
 * key is in the keychain. A key it never confirms is revoked (Liam's review
 * of #5805, HAL-17942). A confirmed sign-in is remembered until then too, so
 * Studio can repeat a confirm whose answer it lost (HAL-18048).
 */
export const handOverLimitMs = 60 * 1000;

/** The scheduler key every sign-in's time limit is set under; the timer ID is the sign-in's ID. */
export const signInTimerKey = "paperclip-sign-in";

/** The connection a sign-in is for. */
export interface SignInConnection {
  /** The address the board uses for Paperclip's page: scheme, host and port, no path. */
  address: string;
  /**
   * The connection file's company. A new connection has none yet: it takes
   * the approver's company, when `me` lists exactly one.
   */
  companyId?: string;
  /** The workspace that holds, or will hold, the connection file; only passed to the key store. */
  workspace: string;
  /** The connection's name, its file name without `.yaml`; only passed to the key store. */
  name: string;
}

/** What Studio gets when a sign-in starts. It never holds the key. */
export interface StartedSignIn {
  signInId: string;
  /** The phrase sent as the challenge's `command`, for Studio to show. */
  phrase: string;
  /** The approval page on the connection's own address. */
  approvalUrl: string;
  /** When the sign-in ends as `expired`, as an ISO time. */
  expiresAt: string;
}

/** Where a sign-in stands after a step. */
export type SignInState =
  | { status: "pending" }
  /**
   * The key was stored for the connection's company. This answer is the only
   * one that holds the key, and the sign-in ends with it, so no later poll
   * gets it again (Liam's option 1, HAL-17439): Studio writes it to the
   * keychain at once.
   */
  | {
      status: "connected";
      userId: string;
      companyId: string;
      key: string;
      /** The connection's name and address, from the start. */
      name: string;
      address: string;
    }
  | { status: "cancelled" | "expired"; keyMayWork?: KeyMayWork }
  /** The key's user isn't in the connection's company; the key was revoked. */
  | { status: "wrong-company" }
  /** No such sign-in: it ended already, or never started. */
  | { status: "unknown" };

/**
 * Set on a cancelled or expired sign-in when Paperclip couldn't say how its
 * challenge ended and the key couldn't be revoked either. If the board
 * approved it, the key works until it expires, and only Paperclip can revoke
 * it; Studio says so, as Disconnect does (Julian, HAL-17733).
 */
export type KeyMayWork = true;

/** What the sign-in flow needs. */
export interface PaperclipSignInOptions {
  /** The Paperclip calls for one connection's address; each sign-in sends only to its own. */
  callsFor: (address: string) => SignInCalls;
  keyStore: PaperclipKeyStore;
  scheduler: Scheduler;
  clock: Clock;
  /** Makes the phrase; tests may pass a fixed one. */
  newPhrase?: () => string;
}

interface OpenSignIn {
  connection: SignInConnection;
  calls: SignInCalls;
  challenge: ChallengeRef;
  /** The board key, held only here until a poll says `approved`. */
  key: string;
  deadline: number;
  /** Whether a poll is waiting for Paperclip's answer. */
  polling: boolean;
}

/** An approved sign-in whose key went to Studio, until its hand-over time limit. */
interface HandedOver {
  calls: SignInCalls;
  entry: StoredPaperclipKey;
  saved: SavedKey;
  /** Whether Studio confirmed the keychain has the key; a confirmed key is never undone. */
  confirmed: boolean;
}

/**
 * Paperclip sign-in in the engine: starts a challenge, polls it and stores
 * the key once the board approves (`agent-host.paperclip-sign-in`). The key
 * Paperclip hands back at the start stays in this object's memory only, and
 * is dropped when the sign-in is cancelled or expires. Each call advances
 * one step; the time limit is a timer through the `Scheduler` port, which
 * the host forwards to {@link PaperclipSignIn.onTimer}.
 */
export class PaperclipSignIn {
  readonly #options: PaperclipSignInOptions;
  readonly #open = new Map<string, OpenSignIn>();
  readonly #handedOver = new Map<string, HandedOver>();

  /** Makes the flow; nothing is sent until {@link start}. */
  constructor(options: PaperclipSignInOptions) {
    this.#options = options;
  }

  /** Starts a sign-in: makes a challenge with a new phrase and sets its time limit. */
  async start(connection: SignInConnection): Promise<StartedSignIn> {
    const phrase = (this.#options.newPhrase ?? newSignInPhrase)();
    const calls = this.#options.callsFor(connection.address);
    const created = await calls.createChallenge({
      command: phrase,
      clientName: signInClientName,
      requestedAccess: "board",
      ...(connection.companyId === undefined ? {} : { requestedCompanyId: connection.companyId }),
    });
    const challenge = { id: created.id, token: created.token };
    const signInId = crypto.randomUUID();
    const deadline = this.#options.clock.now().getTime() + signInLimitMs;
    const expiresAt = new Date(deadline).toISOString();
    this.#open.set(signInId, {
      connection,
      calls,
      challenge,
      key: created.boardApiToken,
      deadline,
      polling: false,
    });
    let approvalUrl: string;
    try {
      approvalUrl = approvalPageUrl(connection.address, created.approvalPath);
      await this.#options.scheduler.schedule(signInTimerKey, signInId, expiresAt);
    } catch (error) {
      // Without a page to open or a time limit the sign-in can't go on: drop the key and end the challenge.
      const open = this.#take(signInId);
      if (open !== undefined) {
        await cleanUpAfterFailure(
          () => this.#endChallenge(open),
          error,
          "Paperclip sign-in couldn't start, and its challenge couldn't be cancelled",
        );
      }
      throw error;
    }
    return { signInId, phrase, approvalUrl, expiresAt };
  }

  /**
   * Whether the engine still holds a key for this sign-in, open or handed over and not confirmed.
   * A confirmed sign-in no longer counts: the connection's key memory holds the key now, and the
   * record is kept only to answer a repeated confirm.
   */
  holdsKey(signInId: string): boolean {
    const handed = this.#handedOver.get(signInId);
    return this.#open.has(signInId) || (handed !== undefined && !handed.confirmed);
  }

  /**
   * Studio says the handed-over key is in its keychain: the key stays
   * connected. Answers whether there was such a sign-in. A repeated confirm
   * answers `true` again until the hand-over limit, so Studio can retry a
   * confirm whose answer got lost instead of undoing a key the host kept.
   */
  async confirm(signInId: string): Promise<boolean> {
    const handed = this.#handedOver.get(signInId);
    if (handed === undefined) return false;
    handed.confirmed = true;
    return true;
  }

  /** Polls the challenge once and acts on its answer. */
  async poll(signInId: string): Promise<SignInState> {
    const open = this.#open.get(signInId);
    if (open === undefined) return { status: "unknown" };
    if (this.#options.clock.now().getTime() >= open.deadline) return this.#expire(signInId);
    // One poll at a time, so two answers can't store or revoke the same key twice.
    if (open.polling) return { status: "pending" };
    open.polling = true;
    let status: ChallengeStatus;
    try {
      status = await open.calls.pollChallenge(open.challenge);
    } finally {
      open.polling = false;
    }
    if (status === "pending") return { status: "pending" };
    // Taken out before any further wait, so a cancel that runs meanwhile finds nothing.
    // Whoever takes a sign-in out owns its key: a cancel or time-out that took it
    // first has ended the challenge and revoked the key if the board approved it.
    if (this.#take(signInId) !== open) return { status: "cancelled" };
    if (status === "approved") return this.#finishApproved(signInId, open);
    await this.#endTimer(signInId);
    return { status };
  }

  /**
   * Ends a sign-in because its dialog closed: drops the key and cancels the
   * challenge. A handed-over key Studio couldn't keep is revoked and undone.
   */
  async cancel(signInId: string): Promise<SignInState> {
    const open = this.#take(signInId);
    if (open === undefined) return await this.#undoHandOver(signInId, "cancelled");
    return await this.#end(signInId, open, "cancelled");
  }

  /**
   * The scheduler's timer: a sign-in still open at its limit ends as
   * `expired`, and a handed-over key Studio didn't confirm in time is undone.
   */
  async onTimer(timer: ScheduledTimer): Promise<void> {
    if (timer.key !== signInTimerKey) return;
    await this.#expire(timer.timerId);
  }

  async #expire(signInId: string): Promise<SignInState> {
    const open = this.#take(signInId);
    if (open === undefined) return await this.#undoHandOver(signInId, "expired");
    // Paperclip ends the challenge too, but its clock may run behind ours.
    return await this.#end(signInId, open, "expired");
  }

  /**
   * Ends a sign-in taken out of memory. The key is already dropped here, so a
   * failed cancel can't be tried again later: the key is revoked instead, and
   * when that fails too, the answer says the key may work.
   */
  async #end(
    signInId: string,
    open: OpenSignIn,
    status: "cancelled" | "expired",
  ): Promise<SignInState> {
    await this.#endTimer(signInId);
    try {
      await this.#endChallenge(open);
      return { status };
    } catch {
      // Paperclip couldn't say how the challenge ended. A key the board never
      // approved can't be revoked, so a failed revoke leaves it unknown.
      const revoked = await open.calls.revokeCurrent(open.key).then(
        () => true,
        () => false,
      );
      return revoked ? { status } : { status, keyMayWork: true };
    }
  }

  /**
   * Cancels a challenge whose sign-in ended without a poll seeing `approved`.
   * If the board approved it first anyway, the key works, so it is revoked:
   * nobody holds it any more.
   */
  async #endChallenge(open: OpenSignIn): Promise<void> {
    const { calls } = open;
    const endedAs = await calls.cancelChallenge(open.challenge);
    if (endedAs === "approved") await calls.revokeCurrent(open.key);
  }

  async #finishApproved(signInId: string, open: OpenSignIn): Promise<SignInState> {
    const { keyStore } = this.#options;
    const { calls } = open;
    try {
      await this.#endTimer(signInId);
      const owner = await calls.readMe(open.key);
      const companyId = companyOf(open.connection, owner.companyIds);
      if (companyId !== undefined) {
        const { address, workspace, name } = open.connection;
        const entry = { address, companyId, key: open.key, workspace, name };
        const saved = await keyStore.save(entry);
        // The limit starts once the save is done, so a slow save can't leave a key with no timer (HAL-18048).
        await this.#scheduleHandOver(signInId, entry, saved);
        this.#handedOver.set(signInId, { calls, entry, saved, confirmed: false });
        return {
          status: "connected",
          userId: owner.userId,
          companyId,
          key: open.key,
          name,
          address,
        };
      }
    } catch (error) {
      // The key works but isn't stored: revoke it so no working key is left anywhere.
      await cleanUpAfterFailure(
        () => calls.revokeCurrent(open.key),
        error,
        "Paperclip sign-in failed after approval, and its key couldn't be revoked",
      );
      throw error;
    }
    // The key's user isn't in the connection's company: refuse the key. Outside
    // the try, so a failed revoke is reported once and not retried.
    await calls.revokeCurrent(open.key);
    return { status: "wrong-company" };
  }

  /** Sets the hand-over limit; when that fails, the save is undone and the caller revokes the key. */
  async #scheduleHandOver(
    signInId: string,
    entry: StoredPaperclipKey,
    saved: SavedKey,
  ): Promise<void> {
    const limit = this.#options.clock.now().getTime() + handOverLimitMs;
    try {
      await this.#options.scheduler.schedule(
        signInTimerKey,
        signInId,
        new Date(limit).toISOString(),
      );
    } catch (error) {
      await cleanUpAfterFailure(
        () => this.#options.keyStore.drop(entry, saved),
        error,
        "Paperclip sign-in couldn't set its hand-over limit, and its save couldn't be undone",
      );
      throw error;
    }
  }

  /**
   * Revokes a handed-over key Studio didn't keep and undoes its save. When the
   * revoke fails, the answer says the key may work. A confirmed key stays:
   * only its record ends.
   */
  async #undoHandOver(signInId: string, status: "cancelled" | "expired"): Promise<SignInState> {
    const handed = this.#handedOver.get(signInId);
    if (handed === undefined) return { status: "unknown" };
    this.#handedOver.delete(signInId);
    await this.#endTimer(signInId);
    if (handed.confirmed) return { status: "unknown" };
    const revoked = await handed.calls.revokeCurrent(handed.entry.key).then(
      () => true,
      () => false,
    );
    await this.#options.keyStore.drop(handed.entry, handed.saved);
    return revoked ? { status } : { status, keyMayWork: true };
  }

  /** Takes a sign-in out of memory, at once and without waiting, so only one caller gets it. */
  #take(signInId: string): OpenSignIn | undefined {
    const open = this.#open.get(signInId);
    this.#open.delete(signInId);
    return open;
  }

  /** Removes a finished sign-in's time limit; a late timer would find nothing open anyway. */
  async #endTimer(signInId: string): Promise<void> {
    await this.#options.scheduler.cancel(signInTimerKey, signInId);
  }
}

/**
 * The company the key is stored for: the connection file's, when the key's
 * user belongs to it; for a new connection, the user's only company. A user
 * in several companies gets none, as Studio can't ask which one yet.
 */
function companyOf(
  connection: SignInConnection,
  companyIds: readonly string[],
): string | undefined {
  if (connection.companyId !== undefined) {
    return companyIds.includes(connection.companyId) ? connection.companyId : undefined;
  }
  return companyIds.length === 1 ? companyIds[0] : undefined;
}

/**
 * Runs a clean-up after a failure. If the clean-up fails too, both errors are
 * thrown together, so neither hides the other.
 */
async function cleanUpAfterFailure(
  cleanUp: () => Promise<void>,
  cause: unknown,
  message: string,
): Promise<void> {
  try {
    await cleanUp();
  } catch (cleanUpError) {
    throw new AggregateError([cause, cleanUpError], message);
  }
}
