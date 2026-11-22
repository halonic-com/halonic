import type { SandboxFix, SandboxUnavailableReason } from "@halonicjs/ports";
import type { Machine } from "./machine.ts";

/**
 * One reason the sandbox can't start, with the sentence that says what is
 * missing and, when this machine has one, the fix as data.
 */
export interface Unavailable {
  reason: SandboxUnavailableReason;
  missing: string;
  fix?: SandboxFix;
  /** Only with `setup-needed`: the setup is there, but for an older srt. */
  setupAgain?: true;
}

/**
 * Why srt can't start on this Windows machine, or `null` when it can: a
 * loopback mode Halonic doesn't change comes first, then a setup that is
 * missing or for an older srt.
 */
export async function firstWindowsUnavailable(machine: Machine): Promise<Unavailable | null> {
  const state = await machine.windowsSandboxState();
  if (state === "ok") return null;
  if (state === "setup-conflict") {
    return {
      reason: "setup-conflict",
      missing:
        "srt's Windows install was set up with loopback open, which Halonic doesn't change; remove that setup first",
    };
  }
  if (await windowsSetupOutdated(machine)) {
    return {
      reason: "setup-needed",
      missing:
        "srt's Windows install is for an older srt; run `srt windows-install` again as an administrator",
      setupAgain: true,
    };
  }
  return {
    reason: "setup-needed",
    missing: "srt's Windows install is missing; run `srt windows-install` once as an administrator",
  };
}

/**
 * Whether srt's Windows setup is there but for an older srt (HAL-5404).
 * False when the machine can't say: the flag only changes the words, and
 * `setup-needed` stands either way.
 */
async function windowsSetupOutdated(machine: Machine): Promise<boolean> {
  try {
    return (await machine.windowsSetupOutdated?.()) ?? false;
  } catch {
    return false;
  }
}
