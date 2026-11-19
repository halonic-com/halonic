import type { SandboxUnavailableReason } from "@halonicjs/ports";
import { isSandboxStartReason } from "./sandbox-start-words.ts";
import { serviceKey } from "./service-registry.ts";

/**
 * What a check for starting the sandbox says: it can start, or it can't and
 * here is the reason code. The check's own sentences are for logs and support,
 * so no screen shows them (HAL-2089). Only for `other`, where the code says
 * nothing, they come along as `details`, for **Copy details** alone.
 */
export type SandboxStartResult =
  | { ok: true }
  | { ok: false; reason: SandboxUnavailableReason; details?: string };

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
  /** The check's own sentences: what is missing, in the host's words. */
  readonly missing?: readonly string[];
}

/**
 * Wraps the host's raw check as a {@link SandboxStartCheck} (requirement
 * `app.sandbox-start-check`). Only `ok` and the reason code get through, and
 * for `other` the check's own sentences as `details`. A failed check whose code
 * Halonic doesn't know, or that has none, reads as `other`. A check that throws
 * makes `check` reject: nothing is swallowed.
 *
 * @example
 * const startCheck = sandboxStartCheck(() => hostSandbox.check());
 * await startCheck.check(); // { ok: false, reason: "bubblewrap-missing" }
 * await startCheck.check(); // { ok: false, reason: "other", details: "no seccomp filter" }
 */
export function sandboxStartCheck(raw: () => Promise<RawSandboxCheck>): SandboxStartCheck {
  return {
    async check() {
      const result = await raw();
      if (result.ok) return { ok: true };
      const reason = reasonOf(result.reason);
      const details = (result.missing ?? []).join("\n");
      if (reason !== "other" || details === "") return { ok: false, reason };
      return { ok: false, reason, details };
    },
  };
}

/** The reason code, or `other` for a missing or unknown one. */
function reasonOf(code: string | null | undefined): SandboxUnavailableReason {
  return code !== null && code !== undefined && isSandboxStartReason(code) ? code : "other";
}
