// The MXC line of `halonic doctor`, without the words: its mark and the
// codes the CLI words it from once the board approves the design (HAL-3290).

import type { DoctorLine } from "./doctor-checks.ts";
import type { MxcSetting, MxcState, SandboxChoice } from "./sandbox-choice.ts";
import type { TrustCheckFailure } from "./sandbox-trust-check.ts";

/** The MXC line: shown only on a computer that offers MXC. */
export interface MxcLine extends DoctorLine {
  check: "mxc";
  state: Exclude<MxcState, "not-offered">;
  /** The setting, as the person left it. */
  setting: MxcSetting;
  /** The setting in effect: the person's, or the default when they haven't set it. */
  effective: "on" | "off";
  /** Why the trust check failed, or `null` when it didn't. */
  reason: TrustCheckFailure | null;
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
 * `undefined` where MXC isn't offered. A failed trust check is ✕ when the
 * person set MXC to `on`, because their steps don't run then, and ! when
 * MXC was only on by default.
 *
 * @example
 * mxcLine({ active: null, mxc: { offered: true, setting: "on", effective: "on",
 *   state: "mxc-check-failed", reason: "too-strict", missing: [] } });
 * // { check: "mxc", status: "failed", state: "mxc-check-failed", reason: "too-strict", ... }
 */
export function mxcLine(choice: SandboxChoice): MxcLine | undefined {
  const { mxc } = choice;
  if (mxc.state === "not-offered") return undefined;
  const facts = { check: "mxc", setting: mxc.setting, effective: mxc.effective } as const;
  const passed = { reason: null, missing: [] };

  switch (mxc.state) {
    case "off":
    case "not-used":
      return { ...facts, ...passed, status: "ok", state: mxc.state, nameLookupsLeave: null };
    case "in-use":
      return {
        ...facts,
        ...passed,
        status: "ok",
        state: mxc.state,
        nameLookupsLeave: mxc.nameLookupsLeave,
      };
    case "mxc-check-failed":
      return {
        ...facts,
        status: mxc.setting === "on" ? "failed" : "warning",
        state: mxc.state,
        reason: mxc.reason,
        missing: [...mxc.missing],
        nameLookupsLeave: null,
      };
  }
}
