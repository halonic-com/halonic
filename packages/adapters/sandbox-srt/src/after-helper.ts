import type { SandboxCheck } from "@halonicjs/ports";
import {
  forgetBeforeHelper,
  HELPER_CANCELLED,
  helperFailure,
  type RemovalSteps,
} from "./elevate-helper.ts";
import { systemRemovalSteps } from "./machine.ts";
import { promptCancelled, type SandboxRemoval, type SandboxSetup } from "./srt-sandbox.ts";

/**
 * How a setup ended that Studio's shell ran through the signed helper, with
 * its own administrator prompt (HAL-14841): the helper's `exitCode`, then
 * this process's unelevated `check`. It is done only when the check passes:
 * an exit code of 0 alone never counts. Other codes read as
 * {@link SrtSandbox.setUp}'s do. Never throws.
 */
export async function setupAfterHelper(
  exitCode: number,
  check: () => Promise<SandboxCheck>,
): Promise<SandboxSetup> {
  if (exitCode === HELPER_CANCELLED) {
    return { ok: false, outcome: "cancelled", reason: promptCancelled };
  }
  if (exitCode !== 0) {
    const reason = helperFailure("setup", exitCode, "");
    return { ok: false, outcome: "failed", reason, code: exitCode };
  }
  let checked: SandboxCheck;
  try {
    checked = await check();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, outcome: "check_failed", reason };
  }
  if (checked.ok) return { ok: true };
  return { ok: false, outcome: "check_failed", reason: checked.missing.join("; ") };
}

/** The log line for a removal's user half skipped for administrator rights (HAL-7585). */
const grantsSkipped =
  "Skipped forgetting the Windows sandbox's kept access grants before its removal: this process runs with administrator rights. Remove it again without them to forget the grants.";

/**
 * The user's half of a removal that Studio's shell then finishes through the
 * signed helper, with its own administrator prompt (HAL-14841): takes back
 * the grants srt kept for this user, before any prompt, as
 * {@link removeThroughHelper} does. `ok` means the shell may start the
 * helper. A process with administrator rights skips it and logs that
 * (HAL-7585). Other systems have nothing to remove.
 * Never throws.
 */
export async function removalBeforeHelper(
  platform: NodeJS.Platform = process.platform,
  steps: RemovalSteps = systemRemovalSteps,
  warn: (message: string) => void = (message) => void process.stderr.write(`${message}\n`),
): Promise<SandboxRemoval> {
  if (platform !== "win32") return { ok: true };
  try {
    if ((await forgetBeforeHelper(steps)) === "skipped") warn(grantsSkipped);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, outcome: "failed", reason };
  }
  return { ok: true };
}

/**
 * How a removal ended that Studio's shell ran through the signed helper, from
 * the helper's `exitCode`: done for 0, `cancelled` for the helper's cancelled
 * code, and `failed` with the helper's reason sentence and its code for any
 * other code, as {@link SrtSandbox.remove}'s do.
 */
export function removalAfterHelper(exitCode: number): SandboxRemoval {
  if (exitCode === 0) return { ok: true };
  if (exitCode === HELPER_CANCELLED) {
    return { ok: false, outcome: "cancelled", reason: promptCancelled };
  }
  return {
    ok: false,
    outcome: "failed",
    reason: helperFailure("remove", exitCode, ""),
    code: exitCode,
  };
}
