// The trust check's "Runs" line with and without the sandbox: microcopy 24.1 R1 to R8, approved
// by the board on HAL-1949, and the rules of the "Runs" line design sections 2, 3 and 7
// (HAL-1873). The reason, fix and docs link come from core's `runnerUnfencedWords`, the one place
// they're written.

import { type RunnerFence, type RunnerUnfencedWords, runnerUnfencedWords } from "@halonicjs/app";
import { TRUST_CHECK_LAST_LINE } from "./trust-text.ts";

/**
 * Whether plugin code runs in the sandbox on this computer, as the trust check shows it (the
 * "Runs" line design section 2, HAL-1873): the engine's {@link RunnerFence}, `checking` while the
 * host reads it, or `undefined` where the host doesn't say, which keeps T9.
 */
export type TrustFence = RunnerFence | { readonly state: "checking" } | undefined;

/** Under the summary while the status is read (R4). */
export const CHECKING_SANDBOX = "Checking the sandbox on this computer…";

/** The checkbox above the buttons, the same in the workspace check (R5). */
export const UNFENCED_CHECKBOX =
  "I understand plugins and integrations run without the sandbox on this computer";

/** In place of the checkbox once the yes for this reason is saved (R6); `on` is "9 Nov". */
export function unfencedAllowedLine(on: string): string {
  return `You allowed plugins and integrations to run without the sandbox on this computer on ${on}, for this reason.`;
}

/** The first line in Addresses: in the sandbox (R7), and not in it (R8). */
export const ADDRESSES_FENCED = "The only addresses this plugin can reach.";
export const ADDRESSES_UNFENCED =
  "Addresses this plugin names. Without the sandbox, its code may connect elsewhere.";

/** Where the docs link of a reason goes; its docs key follows (microcopy 23.3, Docs link). */
export const SANDBOX_DOCS = "https://docs.halonic.dev";

const DOESNT_CHECK = "Halonic doesn't check what the plugin does with what it's given.";

/** What the plugin brings that runs: a backend runs plugin code; programs run in the agent sandbox. */
export interface PluginCode {
  readonly backend: boolean;
  readonly programs: number;
}

/**
 * The trust check's last line: plain, or the amber warning with the reason, the fix and the docs
 * link under it, then the sentence that's always true (R2).
 */
export type TrustLastLine =
  | { readonly kind: "plain"; readonly text: string }
  | {
      readonly kind: "warning";
      readonly warning: string;
      readonly words: RunnerUnfencedWords;
      readonly end: string;
    };

/**
 * The last line for this computer's status (microcopy 24.1 R1, R2 and R2b; design section 3).
 * In the sandbox it's the board's longer line, with "Its program runs in the agent sandbox." only
 * when the plugin has a program. Not in the sandbox, a plugin with a backend gets the amber line
 * with its reason; one with only programs runs no plugin code outside the sandbox, so it keeps
 * the short line. Checking, stopped (not a trust-check state) and unsaid keep T9.
 *
 * @example
 * trustLastLine({ state: "not-fenced", reason: "container" }, { backend: true, programs: 0 }).kind;
 * // "warning"
 */
export function trustLastLine(fence: TrustFence, code: PluginCode): TrustLastLine {
  const program = code.programs > 0 ? " Its program runs in the agent sandbox." : "";
  if (fence?.state === "fenced") {
    return code.backend
      ? {
          kind: "plain",
          text: `Plugin code runs apart from Studio and your files, and can only reach the addresses above.${program} ${DOESNT_CHECK}`,
        }
      : { kind: "plain", text: `Plugin code runs apart from Studio.${program} ${DOESNT_CHECK}` };
  }
  if (fence?.state === "not-fenced" && code.backend) {
    return {
      kind: "warning",
      warning:
        "Plugin code runs apart from Studio, but not in the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach addresses not listed above.",
      words: runnerUnfencedWords(fence.reason, "plugin"),
      end: DOESNT_CHECK,
    };
  }
  return { kind: "plain", text: TRUST_CHECK_LAST_LINE };
}

/** The Addresses section's first line: R7 in the sandbox, R8 for plugin code outside it. */
export function addressesLine(fence: TrustFence, code: PluginCode): string | undefined {
  if (fence?.state === "fenced") return ADDRESSES_FENCED;
  if (fence?.state === "not-fenced" && code.backend) return ADDRESSES_UNFENCED;
  return undefined;
}

/**
 * Whether trusting needs the person's yes to run without the sandbox (design section 7): plugin
 * code outside the sandbox, with no saved yes for this reason. A yes for another reason doesn't
 * count. The dialog only shows it; the engine checks the saved yes at every start.
 */
export function needsUnfencedYes(
  fence: TrustFence,
  code: PluginCode,
  allowed: UnfencedYes | undefined,
): boolean {
  return fence?.state === "not-fenced" && code.backend && allowed?.reason !== fence.reason;
}

/** The yes saved on this computer: its reason, and the day it was given, as "9 Nov". */
export interface UnfencedYes {
  readonly reason: string;
  readonly on: string;
}
