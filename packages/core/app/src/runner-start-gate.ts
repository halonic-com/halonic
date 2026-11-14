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
import type { UnfencedRunDecision, UnfencedRuns } from "./unfenced-runs.ts";

/** The sandbox a start is fenced by, and what decides whether it counts as a fence. */
interface FencedSandbox {
  readonly sandbox: Sandbox;
  readonly backend: RunnerBackend;
  readonly mxcFences: boolean;
}

/** A decision that lets code run without the sandbox. */
type Allowed = Extract<UnfencedRunDecision, { run: "allowed" }>;

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
}

/**
 * Decides at every start where plugin and integration code runs, and starts
 * it there.
 *
 * @example
 * const gate = new RunnerStartGate({ platform: process.platform, fenced: srt, launcher: host, runs });
 * const start = await gate.start((sandbox) => startRunner({ ...options, sandbox }));
 * if (start.run === "needs-yes") showTrustCheck(start.reason);
 */
export class RunnerStartGate {
  readonly #platform: string;
  readonly #fenced: Sandbox;
  readonly #launcher: Sandbox;
  readonly #mxc: MxcFence | undefined;
  readonly #runs: UnfencedRuns;

  constructor(options: RunnerStartGateOptions) {
    this.#platform = options.platform;
    this.#fenced = options.fenced;
    this.#launcher = options.launcher;
    this.#mxc = options.mxc;
    this.#runs = options.runs;
  }

  /**
   * Starts a runner through `startIn` in the sandbox this start may use, or
   * starts nothing and says why.
   *
   * @throws what `startIn` throws, or the store's error when a saved yes can't be removed after the computer passed
   */
  async start<Runner extends GatedRunner>(
    startIn: StartInSandbox<Runner>,
  ): Promise<GatedStart<Runner>> {
    const { sandbox: fenced, backend, mxcFences } = this.#fencedSandbox();
    const check = await fenced.check();
    const fence = runnerFence({ platform: this.#platform, check, backend, mxcFences });
    const decision = await this.#runs.decide(fence);
    switch (decision.run) {
      case "needs-yes":
        return { run: "needs-yes", reason: decision.reason };
      case "stopped":
        return { run: "stopped" };
      case "fenced":
        return this.#startFenced(startIn, check, { sandbox: fenced, backend, mxcFences });
      case "allowed":
        return this.#startUnfenced(startIn, fence, decision);
    }
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
    const runner = await startIn(sandbox, backend);
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
    const runner = await startIn(this.#launcher, "srt");
    if (runner.fence.state !== "off") {
      await runner.close();
      throw new Error(
        `the launcher's sandbox reported the fence proof ${runner.fence.state}, not off`,
      );
    }
    const unregister = this.#runs.registerUnfencedRun(() => runner.close());
    // Forget the run however it stops. A `stopped` that rejects is handled
    // here too, so it never becomes an unhandled rejection.
    void runner.stopped.then(unregister, unregister);
    // Take back may have run while the runner was starting, after it had
    // collected the runs to stop. Asking again now catches that start.
    const now = await this.#runs.decide(fence);
    if (now.run !== "allowed") {
      await runner.close();
      return now.run === "needs-yes"
        ? { run: "needs-yes", reason: now.reason }
        : { run: "stopped" };
    }
    return { run: "unfenced", reason: allowed.reason, allowedAt: allowed.allowedAt, runner };
  }
}
