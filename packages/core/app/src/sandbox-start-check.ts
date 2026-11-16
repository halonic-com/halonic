import type { SandboxUnavailableReason } from "@halonicjs/ports";
import { isSandboxStartReason } from "./sandbox-start-words.ts";
import { serviceKey } from "./service-registry.ts";

/**
 * What a check for starting the sandbox says: it can start, or it can't and
 * here is the reason code. Never the check's own sentence, which is for logs
 * and support, so no screen can show it by accident (HAL-2089).
 */
export type SandboxStartResult = { ok: true } | { ok: false; reason: SandboxUnavailableReason };

/** Checks the sandbox now, for a screen that offers "Check again". */
export interface SandboxStartCheck {
  /** Asks the host's sandbox whether it can start right now. */
  check(): Promise<SandboxStartResult>;
}

/** The key the app provides a {@link SandboxStartCheck} under. */
export const sandboxStartCheckKey = serviceKey<SandboxStartCheck>("app.sandbox-start-check");

/**
 * The part of the host's raw sandbox check that a {@link SandboxStartCheck}
 * reads. A real `SandboxCheck` fits; so does a check from a newer version,
 * whose `reason` this version may not know.
 */
export interface RawSandboxCheck {
  readonly ok: boolean;
  readonly reason?: string | null;
}

/**
 * Wraps the host's raw check as a {@link SandboxStartCheck} (requirement
 * `app.sandbox-start-check`). Only `ok` and the reason code get through. A
 * failed check whose code Halonic doesn't know, or that has none, reads as
 * `other`. A check that throws makes `check` reject: nothing is swallowed.
 *
 * @example
 * const startCheck = sandboxStartCheck(() => hostSandbox.check());
 * await startCheck.check(); // { ok: false, reason: "bubblewrap-missing" }
 */
export function sandboxStartCheck(raw: () => Promise<RawSandboxCheck>): SandboxStartCheck {
  return {
    async check() {
      const result = await raw();
      if (result.ok) return { ok: true };
      return { ok: false, reason: reasonOf(result.reason) };
    },
  };
}

/** The reason code, or `other` for a missing or unknown one. */
function reasonOf(code: string | null | undefined): SandboxUnavailableReason {
  return code !== null && code !== undefined && isSandboxStartReason(code) ? code : "other";
}
