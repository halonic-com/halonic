// Whether plugin and integration code runs in the sandbox on this computer:
// the status the trust check, the plugin page and the connector page read
// (I5 design 4.2, HAL-958; the "Runs" line design 2 and 11, HAL-1873).
// Studio words each reason and its fix; this only decides the status.

import type { SandboxCheck, SandboxFence } from "@halonicjs/ports";

/**
 * Every reason plugin and integration code runs without the sandbox on this
 * computer. Today these are the sandbox's own codes. The list is kept apart
 * from the sandbox's because the two can differ: on Windows the agent
 * sandbox may work while this code still can't run in it, and the Windows 11
 * sandbox may add reasons of its own here (HAL-3381). A new reason is added
 * here, and Studio words it in one place.
 */
export const runnerUnfencedReasons = [
  "windows",
  "container",
  "user-namespaces-restricted",
  "bubblewrap-missing",
  "other",
] as const;

/** Why plugin and integration code runs without the sandbox: one of {@link runnerUnfencedReasons}. */
export type RunnerUnfencedReason = (typeof runnerUnfencedReasons)[number];

/**
 * The fence status of plugin and integration code on this computer.
 *
 * - `fenced`: it runs in the sandbox.
 * - `not-fenced`: it can't, for `reason`. It runs only with the user's saved
 *   yes for that reason.
 * - `stopped`: the computer passed the sandbox check, but the fence failed
 *   when the code started. It never runs outside the sandbox then (A23).
 */
export type RunnerFence =
  | { readonly state: "fenced" }
  | { readonly state: "not-fenced"; readonly reason: RunnerUnfencedReason }
  | { readonly state: "stopped" };

/** What decides the status. */
export interface RunnerFenceInputs {
  /** The operating system of the computer that runs the code, as Node's `process.platform` names it. */
  readonly platform: string;
  /** This computer's `Sandbox.check()`. */
  readonly check: SandboxCheck;
  /** The session's fence proof, once the code is started; left out for the trust check. */
  readonly proof?: SandboxFence;
}

/**
 * The fence status of plugin and integration code, from this computer's
 * sandbox check and, once started, the session's fence proof.
 *
 * On Windows it is always `not-fenced` with `windows`, even when the agent
 * sandbox is set up there and its fence proof passes: the sandbox fences
 * files there, but its network filter doesn't hold, so nothing may suggest
 * a partial sandbox (I5 design 4.3.3, Julian's build condition (b)).
 *
 * @example
 * runnerFence({ platform: "linux", check: { ok: false, reason: "container", missing: [] } });
 * // { state: "not-fenced", reason: "container" }
 * runnerFence({ platform: "win32", check: { ok: true, reason: null, missing: [] }, proof: { state: "fenced" } });
 * // { state: "not-fenced", reason: "windows" }
 */
export function runnerFence({ platform, check, proof }: RunnerFenceInputs): RunnerFence {
  if (platform === "win32") {
    return { state: "not-fenced", reason: "windows" };
  }
  if (!check.ok) {
    return { state: "not-fenced", reason: check.reason };
  }
  if (proof !== undefined && proof.state !== "fenced") {
    return { state: "stopped" };
  }
  return { state: "fenced" };
}
