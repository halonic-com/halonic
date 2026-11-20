// The one gate every start of plugin or integration code goes through (I5
// design 4.2 and 4.3, HAL-958; seams 1 and 3 of the HAL-3386 test plan). At
// each start it asks the fenced sandbox's check again, decides with the
// user's saved yes, and picks the sandbox the code starts in: the fenced one,
// or the launcher's on the path the user confirmed without the fence. It
// never reads what a dialog showed, only the status at this moment.
//
// The trust check (a `TrustGrant` for the code) comes before this gate, so a
// saved yes for running without the fence never stands in for trust.

import type { Sandbox, SandboxCheck, SandboxFence } from "@halonicjs/ports";
import {
  mxcFencesRunner,
  type RunnerBackend,
  type RunnerFence,
  type RunnerUnfencedReason,
  runnerFence,
} from "./runner-fence.ts";
import type { SaveTimers } from "./save-scheduler.ts";
import { isSameYes, type UnfencedRunDecision, type UnfencedRuns } from "./unfenced-runs.ts";

/**
 * How long a runner has to start, in milliseconds, unless the host sets its
 * own limit. It covers the sandbox opening and the runner's ready message,
 * which has 10 s of its own, with room for a slow computer.
 */
export const runnerStartTimeoutMs = 30_000;

/** A runner start that ran past its time limit. Nothing runs: a runner that arrives later is stopped. */
export class RunnerStartTimeoutError extends Error {
  override readonly name = "TimeoutError";

  constructor(timeoutMs: number) {
    super(`The plugin or integration didn't start within ${timeoutMs / 1000} s.`);
  }
}

/** The sandbox a start is fenced by, and what decides whether it counts as a fence. */
interface FencedSandbox {
  readonly sandbox: Sandbox;
  readonly backend: RunnerBackend;
  readonly mxcFences: boolean;
}

/** A decision that lets code run without the sandbox. */
type Allowed = Extract<UnfencedRunDecision, { run: "allowed" }>;

/** The fence status at this moment, and the sandbox and check it came from. */
interface FenceNow {
  readonly fenced: FencedSandbox;
  readonly check: SandboxCheck;
  readonly fence: RunnerFence;
}

/** What the gate needs from a started runner. */
export interface GatedRunner {
  /** The session's fence proof, read when the runner started. */
  readonly fence: SandboxFence;
  /** Settles once the runner has stopped, for any reason. */
  readonly stopped: Promise<unknown>;
  /** Stops the runner and closes its session. */
  close(): Promise<void>;
}

/**
 * Starts the runner in the sandbox the gate picked. `backend` says which
 * fenced backend it is, so the start builds that backend's profile; the
 * launcher's sandbox gets `srt`'s, as before.
 */
export type StartInSandbox<Runner extends GatedRunner> = (
  sandbox: Sandbox,
  backend: RunnerBackend,
) => Promise<Runner>;

/** MXC as the fenced sandbox on Windows 11, once the sandbox choice picks it. */
export interface MxcFence {
  /** The `sandbox-mxc` sandbox. */
  readonly sandbox: Sandbox;
  /** Whether the sandbox choice has MXC in use right now (`active` is `mxc`). Read at every start. */
  inUse(): boolean;
  /** Whether MXC counts as a fence for the runner; {@link mxcFencesRunner} when left out. */
  readonly fencesRunner?: boolean;
}

/**
 * What came of a start.
 *
 * - `fenced`: the runner runs in the sandbox.
 * - `unfenced`: it runs without the sandbox, with the user's yes for `reason`
 *   given on `allowedAt`. Take back stops it.
 * - `needs-yes`: nothing started; the user has to tick the trust check's box
 *   for `reason` first.
 * - `stopped`: nothing runs: the computer passed the sandbox check, but the
 *   fence failed (A23). It never falls back to the launcher then.
 */
export type GatedStart<Runner extends GatedRunner> =
  | { readonly run: "fenced"; readonly runner: Runner }
  | {
      readonly run: "unfenced";
      readonly reason: RunnerUnfencedReason;
      readonly allowedAt: string;
      readonly runner: Runner;
    }
  | { readonly run: "needs-yes"; readonly reason: RunnerUnfencedReason }
  | { readonly run: "stopped" };

/** What {@link RunnerStartGate} needs from the host. */
export interface RunnerStartGateOptions {
  /** The operating system, as Node's `process.platform` names it. */
  readonly platform: string;
  /** The fenced sandbox (`sandbox-srt`): its check decides, and the code starts in it when it passes. */
  readonly fenced: Sandbox;
  /** MXC, for Windows 11; left out where the host has none. */
  readonly mxc?: MxcFence;
  /** The launcher's sandbox without a fence (`sandbox-host`), for the confirmed path only. */
  readonly launcher: Sandbox;
  /** The user's saved yes, and the runs Take back stops. */
  readonly runs: UnfencedRuns;
  /** What a start's time limit waits with: `setTimeout` and `clearTimeout`, or a test's own. */
  readonly timers: SaveTimers;
  /** How long a runner has to start, in milliseconds; {@link runnerStartTimeoutMs} when left out. */
  readonly startTimeoutMs?: number;
}

/**
 * Decides at every start where plugin and integration code runs, and starts
 * it there.
 *
 * @example
 * const gate = new RunnerStartGate({ platform: process.platform, fenced: srt, launcher: host, runs, timers });
 * const start = await gate.start((sandbox) => startRunner({ ...options, sandbox }));
 * if (start.run === "needs-yes") showTrustCheck(start.reason);
 */
export class RunnerStartGate {
  readonly #platform: string;
  readonly #fenced: Sandbox;
  readonly #launcher: Sandbox;
  readonly #mxc: MxcFence | undefined;
  readonly #runs: UnfencedRuns;
  readonly #timers: SaveTimers;
  readonly #startTimeoutMs: number;

  /** @throws RangeError when `startTimeoutMs` isn't a whole number of milliseconds of 1 or more */
  constructor(options: RunnerStartGateOptions) {
    const startTimeoutMs = options.startTimeoutMs ?? runnerStartTimeoutMs;
    if (!(Number.isInteger(startTimeoutMs) && startTimeoutMs >= 1)) {
      throw new RangeError(
        `startTimeoutMs must be a whole number of milliseconds of 1 or more, not ${startTimeoutMs}.`,
      );
    }
    this.#platform = options.platform;
    this.#fenced = options.fenced;
    this.#launcher = options.launcher;
    this.#mxc = options.mxc;
    this.#runs = options.runs;
    this.#timers = options.timers;
    this.#startTimeoutMs = startTimeoutMs;
  }

  /**
   * Starts a runner through `startIn` in the sandbox this start may use, or
   * starts nothing and says why.
   *
   * @throws {@link RunnerStartTimeoutError} when `startIn` doesn't settle within the start's time limit
   * @throws what `startIn` throws, or the store's error when a saved yes can't be removed after the computer passed
   */
  async start<Runner extends GatedRunner>(
    startIn: StartInSandbox<Runner>,
  ): Promise<GatedStart<Runner>> {
    const { fenced, check, fence } = await this.#fenceNow();
    const decideAndStart = () => this.#decideAndStart(startIn, fenced, check, fence);
    if (fence.state === "not-fenced") {
      // Take back waits for this start, from before it reads the yes.
      return await this.#runs.whileStarting(decideAndStart);
    }
    return await decideAndStart();
  }

  async #decideAndStart<Runner extends GatedRunner>(
    startIn: StartInSandbox<Runner>,
    fenced: FencedSandbox,
    check: SandboxCheck,
    fence: RunnerFence,
  ): Promise<GatedStart<Runner>> {
    const decision = await this.#runs.decide(fence);
    switch (decision.run) {
      case "needs-yes":
        return { run: "needs-yes", reason: decision.reason };
      case "stopped":
        return { run: "stopped" };
      case "fenced":
        return this.#startFenced(startIn, check, fenced);
      case "allowed":
        return this.#startUnfenced(startIn, fence, decision);
    }
  }

  /**
   * What a start would decide now, for the trust check and Settings to show:
   * the same fence status and saved yes {@link RunnerStartGate.start} asks,
   * so the two never disagree on the reason. It starts nothing.
   *
   * Like {@link UnfencedRuns.decide}, it removes the saved yes when the
   * computer is in the sandbox now, so a later failure asks again.
   *
   * @example
   * const status = await gate.status();
   * if (status.run === "needs-yes") showRunsLine(status.reason);
   *
   * @throws the store's error when a saved yes can't be removed after the computer passed
   */
  async status(): Promise<UnfencedRunDecision> {
    const { fence } = await this.#fenceNow();
    return await this.#runs.decide(fence);
  }

  /**
   * Saves the user's yes for `reason`, but only when `reason` is why code
   * runs without the sandbox right now: a yes is never saved for a status
   * the user didn't see. Only for the trust check's box, ticked in Studio.
   *
   * @example
   * const allowed = await gate.allow("container");
   * if (allowed === null) readTheStatusAgain();
   *
   * @returns the yes as saved, or `null` when `reason` isn't the current one and nothing was saved
   */
  async allow(reason: RunnerUnfencedReason): Promise<Allowed | null> {
    const { fence } = await this.#fenceNow();
    if (fence.state !== "not-fenced" || fence.reason !== reason) return null;
    return await this.#runs.allow(reason);
  }

  /** Asks the fenced sandbox's check again, and the fence status it gives on this platform. */
  async #fenceNow(): Promise<FenceNow> {
    const fenced = this.#fencedSandbox();
    const check = await fenced.sandbox.check();
    const fence = runnerFence({
      platform: this.#platform,
      check,
      backend: fenced.backend,
      mxcFences: fenced.mxcFences,
    });
    return { fenced, check, fence };
  }

  /** The fenced sandbox for this start: MXC while the sandbox choice has it in use, else srt. */
  #fencedSandbox(): FencedSandbox {
    const mxc = this.#mxc;
    if (mxc !== undefined && mxc.inUse()) {
      return {
        sandbox: mxc.sandbox,
        backend: "mxc",
        mxcFences: mxc.fencesRunner ?? mxcFencesRunner,
      };
    }
    return { sandbox: this.#fenced, backend: "srt", mxcFences: false };
  }

  async #startFenced<Runner extends GatedRunner>(
    startIn: StartInSandbox<Runner>,
    check: SandboxCheck,
    { sandbox, backend, mxcFences }: FencedSandbox,
  ): Promise<GatedStart<Runner>> {
    const runner = await this.#startWithin(startIn, sandbox, backend);
    const proven = runnerFence({
      platform: this.#platform,
      check,
      proof: runner.fence,
      backend,
      mxcFences,
    });
    if (proven.state !== "fenced") {
      // A fenced sandbox refuses to start on a failed proof; this holds even if one didn't.
      await runner.close();
      return { run: "stopped" };
    }
    return { run: "fenced", runner };
  }

  async #startUnfenced<Runner extends GatedRunner>(
    startIn: StartInSandbox<Runner>,
    fence: RunnerFence,
    allowed: Allowed,
  ): Promise<GatedStart<Runner>> {
    const runner = await this.#startWithin(startIn, this.#launcher, "srt");
    if (runner.fence.state !== "off") {
      await runner.close();
      throw new Error(
        `the launcher's sandbox reported the fence proof ${runner.fence.state}, not off`,
      );
    }
    const unregister = this.#runs.registerUnfencedRun(allowed, () => runner.close());
    // Forget the run however it stops. A `stopped` that rejects is handled
    // here too, so it never becomes an unhandled rejection.
    void runner.stopped.then(unregister, unregister);
    // Take back may have run while the runner was starting; it waits for this
    // start. Asking again now catches that, and stops the runner before Take
    // back returns. A yes given again since is another yes, so the runner
    // stops then too and the caller asks again. A runner that fails to stop
    // stays registered, so Take back tries again and reports it.
    const now = await this.#runs.decide(fence);
    if (now.run !== "allowed" || !isSameYes(allowed, now)) {
      await runner.close();
      unregister();
      return now.run === "needs-yes" || now.run === "allowed"
        ? { run: "needs-yes", reason: now.reason }
        : { run: "stopped" };
    }
    return { run: "unfenced", reason: allowed.reason, allowedAt: allowed.allowedAt, runner };
  }

  /**
   * Starts the runner within the start's time limit. When the time is up the
   * start fails closed: a start without the sandbox no longer holds up Take
   * back, and a runner that arrives later is stopped at once.
   */
  async #startWithin<Runner extends GatedRunner>(
    startIn: StartInSandbox<Runner>,
    sandbox: Sandbox,
    backend: RunnerBackend,
  ): Promise<Runner> {
    return await new Promise<Runner>((resolve, reject) => {
      let timedOut = false;
      const timer = this.#timers.set(() => {
        timedOut = true;
        reject(new RunnerStartTimeoutError(this.#startTimeoutMs));
      }, this.#startTimeoutMs);
      // A start that throws straight away, without a promise, fails like
      // one that rejects, so its time limit is cleared too.
      const starting = new Promise<Runner>((started) => started(startIn(sandbox, backend)));
      starting.then(
        (runner) => {
          if (!timedOut) {
            this.#timers.clear(timer);
            resolve(runner);
            return;
          }
          // Nobody waits for it any more. If it fails to stop, the runner's
          // own limit ends it: nothing ever calls it, and it stops after two
          // minutes without a call.
          runner.close().catch(() => undefined);
        },
        (error: unknown) => {
          // After the time is up, the start's own error has nobody to go to.
          if (timedOut) return;
          this.#timers.clear(timer);
          reject(error);
        },
      );
    });
  }
}
