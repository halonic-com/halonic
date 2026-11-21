import type { SandboxCheck } from "@halonicjs/ports";
import { HELPER_CANCELLED, helperFailure } from "./elevate-helper.ts";
import { promptCancelled, type SandboxSetup } from "./srt-sandbox.ts";

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
