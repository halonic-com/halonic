/**
 * The four parts of a service's own sign-in, as a stepper runs them in the
 * foreground (architecture note on HAL-17491, row 15 and section 6.7; Liam's
 * approval of option (A) on HAL-17545). The key never passes through here:
 * `ServiceSignIn` puts it in the keychain. The code, the countdown and whom
 * the key signs in as live only while the stepper is open, so the record
 * keeps a sign-in's first three parts only once its key is kept.
 */
import type { SignInPhase } from "@halonicjs/action-steppers";
import type { ServiceSignIn, SignInConnectionRef, SignInRevoke } from "@halonicjs/ports";
import type { ServiceSignInView, StepOutcome } from "../stepper-view.ts";

/** What a stepper needs to run a sign-in: Studio's `ServiceSignIn` and the shell's way to open a page. */
export interface StepperSignIn {
  readonly signIn: ServiceSignIn;
  /** Opens the approval page in the browser; `ServiceSignIn` checked it is on the connection's address. */
  readonly openPage: (url: string) => Promise<void>;
}

/** Paperclip's challenge lifetime: no countdown runs longer, whatever the host says (condition 4). */
const signInLimitMs = 10 * 60 * 1000;

/** What a part says when it can't go on, in Halonic's own words. */
export const signInRunWords = {
  expired: "The sign-in expired.",
  startAgain: "Start the sign-in again from its first step.",
  cancelled: "The sign-in was cancelled.",
  wrongCompany:
    "The person who approved isn't in this connection's company, so the key was revoked.",
  "no-connection": "This workspace has no such Paperclip connection.",
  "other-host": "The sign-in didn't stay on the connection's own Paperclip address.",
  "already-signed-in":
    "This connection is already signed in. Disconnect it first to test a new sign-in.",
  unreachable: "Paperclip couldn't be reached. Try again in a moment.",
  "too-many-sign-ins": "Paperclip has too many sign-ins waiting. Try again in a few minutes.",
  notSignedIn: "Paperclip doesn't accept this connection's key.",
  revoked: "The test key is revoked, and this computer no longer keeps it.",
  revokeLeft: {
    "not-a-test":
      "Only a test sign-in made in this window can be revoked here. Use Disconnect in Settings › Connections.",
    "still-works":
      "Paperclip may still accept the test key. Disconnect it in Settings › Connections.",
    unreachable:
      "Paperclip couldn't be reached, so the test key may still work until it expires. This computer no longer keeps it.",
  } satisfies Record<Exclude<SignInRevoke["outcome"], "revoked">, string>,
} as const;

/** A sign-in started in this window. */
interface Live {
  readonly signInId: string;
  readonly code: string;
  readonly approvalUrl: string;
  /** When it expires, in milliseconds. */
  readonly deadline: number;
  /** Whether its key is in the keychain. */
  kept: boolean;
}

/**
 * Runs one request's sign-in parts in order, and says how each stands in this
 * window. {@link run} answers the parts the record may now keep.
 */
export class SignInRun {
  readonly #service: StepperSignIn;
  readonly #ref: SignInConnectionRef;
  readonly #test: boolean;
  readonly #now: () => Date;
  #live: Live | undefined;
  /** The started sign-in's code, which the first part's line still shows once a test key is revoked. */
  #code = "";
  #account: string | undefined;
  /** Ends the wait for an approval when the stepper closes. */
  #closing: AbortController | undefined;
  readonly #done = new Set<SignInPhase>();
  #failed: { phase: SignInPhase; message: string } | undefined;

  constructor(service: StepperSignIn, ref: SignInConnectionRef, test: boolean, now: () => Date) {
    this.#service = service;
    this.#ref = ref;
    this.#test = test;
    this.#now = now;
  }

  /** The code, the countdown and whom the key signs in as, while a sign-in lives in this window. */
  panel(): ServiceSignInView | undefined {
    const live = this.#live;
    if (live === undefined) return undefined;
    return {
      code: live.code,
      expiresAt: new Date(live.deadline),
      kept: live.kept,
      account: this.#account ?? null,
    };
  }

  /** How a part stands in this window, over what the record says. */
  outcome(phase: SignInPhase, recorded: StepOutcome): StepOutcome {
    if (this.#done.has(phase)) {
      const signedInAs = this.#account === undefined ? undefined : `Signed in as ${this.#account}.`;
      if (phase === "start") return { kind: "succeeded", result: `Code ${this.#code}` };
      const revoked = phase === "test" && this.#test ? ` ${signInRunWords.revoked}` : "";
      return {
        kind: "succeeded",
        result: signedInAs === undefined ? undefined : signedInAs + revoked,
      };
    }
    // A part recorded in an earlier window stays done; this window's failure shows otherwise.
    if (recorded.kind === "succeeded") return recorded;
    if (this.#failed?.phase === phase) return { kind: "failed", message: this.#failed.message };
    return recorded;
  }

  /** Runs one part; answers the parts the record may keep now, which may be none. */
  async run(phase: SignInPhase): Promise<readonly SignInPhase[]> {
    this.#failed = undefined;
    switch (phase) {
      case "start":
        return this.#start();
      case "approve":
        return this.#approve();
      case "keep":
        return this.#keep();
      case "test":
        return this.#check();
    }
  }

  /**
   * Stops waiting and cancels a sign-in whose key isn't kept, when the stepper
   * closes (6.7). A test key kept but not yet tested is revoked too: a resumed
   * test would refuse to start while it is still in the keychain.
   */
  async close(): Promise<void> {
    this.#closing?.abort();
    const live = this.#live;
    if (live === undefined) return;
    if (!live.kept) {
      await this.#service.signIn.cancel(live.signInId);
      return;
    }
    if (!this.#test || this.#done.has("test")) return;
    this.#live = undefined;
    const revoke = await this.#service.signIn.revokeTest(live.signInId);
    if (revoke.outcome !== "revoked") throw new Error(signInRunWords.revokeLeft[revoke.outcome]);
  }

  async #start(): Promise<readonly SignInPhase[]> {
    await this.#reset();
    const startedAt = this.#now().getTime();
    const started = await this.#service.signIn.start(this.#ref, { test: this.#test });
    if (started.outcome === "refused") return this.#fail("start", signInRunWords[started.reason]);
    const { signInId, code, approvalUrl } = started;
    const deadline = Math.min(Date.parse(started.expiresAt), startedAt + signInLimitMs);
    this.#live = { signInId, code, approvalUrl, deadline, kept: false };
    this.#code = code;
    this.#done.add("start");
    return [];
  }

  async #approve(): Promise<readonly SignInPhase[]> {
    const live = await this.#waiting("approve");
    if (live === undefined) return [];
    await this.#service.openPage(live.approvalUrl);
    this.#done.add("approve");
    return [];
  }

  async #keep(): Promise<readonly SignInPhase[]> {
    const live = await this.#waiting("keep");
    if (live === undefined) return [];
    this.#closing = new AbortController();
    const ended = await this.#service.signIn.follow(live.signInId, this.#closing.signal);
    this.#closing = undefined;
    switch (ended.outcome) {
      case "signed-in":
        live.kept = true;
        this.#account = ended.account.name;
        this.#done.add("keep");
        return ["start", "approve", "keep"];
      case "expired":
        return this.#expire("keep");
      case "wrong-company":
        await this.#reset();
        return this.#fail("keep", signInRunWords.wrongCompany);
      default:
        await this.#reset();
        return this.#fail("keep", signInRunWords.cancelled);
    }
  }

  /** Says whom the key signs in as; for a test sign-in, then revokes the key it made. */
  async #check(): Promise<readonly SignInPhase[]> {
    const account = await this.#service.signIn.whoAmI(this.#ref);
    if (account === undefined) return this.#fail("test", signInRunWords.notSignedIn);
    this.#account = account.name;
    if (this.#test) {
      const revoke = await this.#service.signIn.revokeTest(this.#live?.signInId ?? "");
      if (revoke.outcome !== "revoked") {
        return this.#fail("test", signInRunWords.revokeLeft[revoke.outcome]);
      }
      // The key is gone, so its panel goes too; the step's line still says who it was.
      this.#live = undefined;
    }
    this.#done.add("test");
    return ["test"];
  }

  /** The sign-in waiting for approval, or `undefined` after saying why the part can't run. */
  async #waiting(phase: SignInPhase): Promise<Live | undefined> {
    const live = this.#live;
    if (live === undefined || live.kept) {
      this.#fail(phase, signInRunWords.startAgain);
      return undefined;
    }
    if (this.#now().getTime() < live.deadline) return live;
    await this.#expire(phase);
    return undefined;
  }

  /** Ends the sign-in after its 10 minutes: the stepper stops, and starts again at its first part. */
  async #expire(phase: SignInPhase): Promise<readonly SignInPhase[]> {
    await this.#reset();
    return this.#fail(phase, signInRunWords.expired);
  }

  /** Forgets the sign-in in this window, cancelling it if its key isn't kept. */
  async #reset(): Promise<void> {
    const live = this.#live;
    this.#live = undefined;
    this.#code = "";
    this.#account = undefined;
    this.#done.clear();
    if (live !== undefined && !live.kept) await this.#service.signIn.cancel(live.signInId);
  }

  #fail(phase: SignInPhase, message: string): readonly SignInPhase[] {
    this.#failed = { phase, message };
    return [];
  }
}
