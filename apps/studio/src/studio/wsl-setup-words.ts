import { sandboxStartWords } from "@halonicjs/app";
import type { SandboxOutcome } from "@halonicjs/studio-feature-settings";
import type { ShellWslSetup } from "./sandbox-wsl-setup-shell.ts";

/**
 * Why the WSL setup failed, where the sandbox-start catalogue's words for the port's reason would
 * be wrong: those reasons are `other`, which says Halonic can't tell (HAL-16780). Each goes after
 * "The sandbox isn't set up: ".
 */
const setupCodeWords: Readonly<Record<string, string>> = {
  "distro-not-ours":
    "a WSL distro called halonic is already on this computer, and Halonic didn't install it, so it isn't replaced. Remove or rename that distro, then try again.",
  "kernel-too-old": "WSL needs an update first. Run wsl --update in PowerShell, then try again.",
  "kernel-unreadable": "WSL needs an update first. Run wsl --update in PowerShell, then try again.",
};

/** The image of Halonic's distro isn't beside the app (until the installer ships it, HAL-16780). */
const IMAGE_MISSING =
  "this copy of Halonic doesn't include the Linux system the sandbox runs in. Reinstall the Halonic desktop app.";

/** The shell couldn't start the host beside the app (C525-7, HAL-15013). */
const HOST_DIDNT_START = "Windows couldn't start Halonic's sandbox helper.";

/** The setup ended without saying how: the line the host's own setup uses for that. */
const NO_ANSWER = "the host stopped before it said how it ended.";

/**
 * What a WSL setup that didn't work leaves for Settings › Agent sandbox, in the section's existing
 * outcomes: null when it is done or Windows must restart, as the check that follows says those.
 * A failure is worded from its reason code, the sandbox-start catalogue's sentence (`sandboxStartWords`),
 * so the section, the run page and the CLI agree. What the setup itself said goes only to the log,
 * or into **Copy details** for an internal error (microcopy 22 F13).
 */
export function wslSetupOutcome(answer: ShellWslSetup): SandboxOutcome | null {
  switch (answer.outcome) {
    case "done":
    case "restart_needed":
      return null;
    case "cancelled":
      return { kind: "setup", how: "cancelled" };
    case "timed_out":
      return { kind: "setup", how: "timed-out", repairing: false };
    case "still_running":
      return { kind: "setup", how: "still-running", repairing: false };
    case "failed":
      console.error("The WSL setup failed", answer.code ?? answer.reason, answer.details);
      return { kind: "setup", how: "failed", reason: failedReason(answer.reason, answer.code) };
    case "image_missing":
      return { kind: "setup", how: "failed", reason: IMAGE_MISSING };
    case "not_started":
      return { kind: "setup", how: "failed", reason: HOST_DIDNT_START, details: answer.details };
    case "unanswered":
      return {
        kind: "setup",
        how: "failed",
        reason: NO_ANSWER,
        details:
          answer.exitCode === undefined ? NO_ANSWER : `${NO_ANSWER} Exit code ${answer.exitCode}.`,
      };
  }
}

/** The setup's own words for its code where it has them, else the catalogue's for the reason. */
function failedReason(reason: string, code: string | undefined): string {
  const own = code === undefined ? undefined : setupCodeWords[code];
  return own ?? sandboxStartWords(reason).reason;
}
