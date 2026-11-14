// The MXC line of `halonic doctor`, without the words: its mark and the
// codes the CLI words it from once the board approves the design (HAL-3290).

import type { DoctorLine } from "./doctor-checks.ts";
import type { SandboxBackendState, SandboxBackendStatus, SandboxChoice } from "./sandbox-choice.ts";

/** The MXC line: shown only on a computer that offers MXC. */
export interface MxcLine extends DoctorLine {
  check: "mxc";
  state: SandboxBackendState;
  /** Whether the person chose MXC. A default list never picks it. */
  chosen: boolean;
  /** Why MXC can't run or its trust check failed, or `null` when it can. */
  reason: SandboxBackendStatus["reason"];
  /** The sentences behind `reason`, for `--debug` only. */
  missing: string[];
  /**
   * While MXC is in use: whether name lookups leave the box through Windows'
   * DNS service, the known limit `doctor` shows. `null` otherwise.
   */
  nameLookupsLeave: boolean | null;
}

/**
 * The MXC line of `halonic doctor` (requirement `app.doctor-mxc`), or
 * `undefined` where MXC isn't offered. Anything but `in-use` is ✕ when the
 * person chose MXC, because their steps don't run then. A failed trust
 * check of an MXC nobody chose is !; every other state is ok.
 *
 * @example
 * mxcLine(choice);
 * // { check: "mxc", status: "failed", state: "check-failed", chosen: true, reason: "too-strict", ... }
 */
export function mxcLine(choice: SandboxChoice): MxcLine | undefined {
  const mxc = choice.backends.find((backend) => backend.id === "mxc");
  if (mxc === undefined || !mxc.offered) return undefined;
  const chosen = choice.setting?.backend === "mxc";
  const inUse = mxc.state === "in-use";
  return {
    check: "mxc",
    status: statusOf(mxc.state, chosen),
    state: mxc.state,
    chosen,
    reason: mxc.reason,
    missing: [...mxc.missing],
    nameLookupsLeave: inUse ? mxc.residuals.includes("name-lookups-leave") : null,
  };
}

function statusOf(state: SandboxBackendState, chosen: boolean): MxcLine["status"] {
  if (chosen && state !== "in-use") return "failed";
  return state === "check-failed" ? "warning" : "ok";
}
