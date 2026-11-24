import type { Clock, ScheduledTimer, Scheduler } from "@halonicjs/ports";
import type {
  ChallengeRef,
  ChallengeStatus,
  PaperclipKeyStore,
  SignInCalls,
} from "./sign-in-calls.ts";
import { newSignInPhrase } from "./sign-in-phrase.ts";

/** How long a sign-in lasts: Paperclip's challenge lifetime (HAL-17423). */
export const signInLimitMs = 10 * 60 * 1000;

/** The scheduler key every sign-in's time limit is set under; the timer ID is the sign-in's ID. */
export const signInTimerKey = "paperclip-sign-in";

/** The name Paperclip shows on the approval page and gives the key. */
export const signInClientName = "Halonic Studio";

/** The connection a sign-in is for. */
export interface SignInConnection {
  /** The address the board uses for Paperclip's page: scheme, host and port, no path. */
  address: string;
  companyId: string;
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
  | { status: "connected"; userId: string }
  | { status: "cancelled" }
  | { status: "expired" }
  /** The key's user isn't in the connection's company; the key was revoked. */
  | { status: "wrong-company" }
  /** No such sign-in: it ended already, or never started. */
  | { status: "unknown" };

/** What the sign-in flow needs. */
export interface PaperclipSignInOptions {
  calls: SignInCalls;
  keyStore: PaperclipKeyStore;
  scheduler: Scheduler;
  clock: Clock;
  /** Makes the phrase; tests may pass a fixed one. */
  newPhrase?: () => string;
}

interface OpenSignIn {
  connection: SignInConnection;
  challenge: ChallengeRef;
  /** The board key, held only here until a poll says `approved`. */
  key: string;
  deadline: number;
  /** Whether a poll is waiting for Paperclip's answer. */
  polling: boolean;
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

  /** Makes the flow; nothing is sent until {@link start}. */
  constructor(options: PaperclipSignInOptions) {
    this.#options = options;
  }

  /** Starts a sign-in: makes a challenge with a new phrase and sets its time limit. */
  async start(connection: SignInConnection): Promise<StartedSignIn> {
    const phrase = (this.#options.newPhrase ?? newSignInPhrase)();
    const created = await this.#options.calls.createChallenge({
      command: phrase,
      clientName: signInClientName,
      requestedAccess: "board",
      requestedCompanyId: connection.companyId,
    });
    const challenge = { id: created.id, token: created.token };
    const signInId = crypto.randomUUID();
    const deadline = this.#options.clock.now().getTime() + signInLimitMs;
    const expiresAt = new Date(deadline).toISOString();
    this.#open.set(signInId, {
      connection,
      challenge,
      key: created.boardApiToken,
      deadline,
      polling: false,
    });
    let approvalUrl: string;
    try {
      approvalUrl = approvalUrlFor(connection.address, created.approvalPath);
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

  /** Whether the engine still holds a key for this sign-in. */
  holdsKey(signInId: string): boolean {
    return this.#open.has(signInId);
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
      status = await this.#options.calls.pollChallenge(open.challenge);
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

  /** Ends a sign-in because its dialog closed: drops the key and cancels the challenge. */
  async cancel(signInId: string): Promise<SignInState> {
    const open = this.#take(signInId);
    if (open === undefined) return { status: "unknown" };
    await this.#endChallenge(open);
    await this.#endTimer(signInId);
    return { status: "cancelled" };
  }

  /** The scheduler's timer: a sign-in still open at its limit ends as `expired`. */
  async onTimer(timer: ScheduledTimer): Promise<void> {
    if (timer.key !== signInTimerKey) return;
    await this.#expire(timer.timerId);
  }

  async #expire(signInId: string): Promise<SignInState> {
    const open = this.#take(signInId);
    if (open === undefined) return { status: "unknown" };
    // Paperclip ends the challenge too, but its clock may run behind ours.
    await this.#endChallenge(open);
    await this.#endTimer(signInId);
    return { status: "expired" };
  }

  /**
   * Cancels a challenge whose sign-in ended without a poll seeing `approved`.
   * If the board approved it first anyway, the key works, so it is revoked:
   * nobody holds it any more.
   */
  async #endChallenge(open: OpenSignIn): Promise<void> {
    const { calls } = this.#options;
    const endedAs = await calls.cancelChallenge(open.challenge);
    if (endedAs === "approved") await calls.revokeCurrent(open.key);
  }

  async #finishApproved(signInId: string, open: OpenSignIn): Promise<SignInState> {
    const { calls, keyStore } = this.#options;
    try {
      await this.#endTimer(signInId);
      const owner = await calls.readMe(open.key);
      if (owner.companyIds.includes(open.connection.companyId)) {
        await keyStore.save({
          address: open.connection.address,
          companyId: open.connection.companyId,
          key: open.key,
        });
        return { status: "connected", userId: owner.userId };
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

/**
 * The approval page on the connection's own address. Only a path under
 * `/cli-auth/` is taken from Paperclip's answer, so the page Studio opens is
 * always on the address the board chose.
 */
function approvalUrlFor(address: string, approvalPath: string): string {
  if (!approvalPath.startsWith("/cli-auth/") || approvalPath.includes("..")) {
    throw new Error("Paperclip answered with an approval path outside /cli-auth/");
  }
  const url = new URL(approvalPath, address);
  if (url.origin !== new URL(address).origin) {
    throw new Error("Paperclip answered with an approval page on another address");
  }
  return url.toString();
}
