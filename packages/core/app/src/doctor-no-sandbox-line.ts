// The "No sandbox" line of `halonic doctor`, without the words: its mark and
// the codes the CLI words it from.

import type { DoctorLine } from "./doctor-checks.ts";
import type { LimitCode, SandboxChoice } from "./sandbox-choice.ts";

/** The "No sandbox" line: shown only while the person's choice is `none`. */
export interface NoSandboxLine extends DoctorLine {
  check: "no-sandbox";
  /** When the person chose, as ISO text. */
  chosenAt: string;
  /** The Halonic version that was running when they chose. */
  appVersion: string;
  /** What no sandbox does not protect. */
  limits: LimitCode[];
}

/**
 * The "No sandbox" line of `halonic doctor` (requirement
 * `app.doctor-no-sandbox`), or `undefined` when the person didn't choose
 * `none`. It is a warning, never ok: nothing fences files or the network.
 *
 * @example
 * noSandboxLine(choice);
 * // { check: "no-sandbox", status: "warning", chosenAt, appVersion, limits: ["no-file-fence", "no-network-fence"] }
 */
export function noSandboxLine(choice: SandboxChoice): NoSandboxLine | undefined {
  const setting = choice.setting;
  if (setting?.backend !== "none" || choice.active !== "none") return undefined;
  return {
    check: "no-sandbox",
    status: "warning",
    chosenAt: setting.chosenAt,
    appVersion: setting.appVersion,
    limits: ["no-file-fence", "no-network-fence"],
  };
}
