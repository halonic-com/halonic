import type { Sandbox, SandboxCheck, SandboxUnavailableReason } from "@halonicjs/ports";
import { sandboxCheckContract } from "./sandbox.ts";

/** A sandbox that only checks: it can start, or can't for `reason`, and never opens a session. */
function checkOnlySandbox(reason: SandboxUnavailableReason | null): Sandbox {
  const check: SandboxCheck =
    reason === null
      ? { ok: true, reason: null, missing: [] }
      : { ok: false, reason, missing: [`the sandbox can't start here (${reason})`] };
  return {
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error(check.ok ? "this fake opens no session" : check.missing.join("; "));
    },
  };
}

// The suite on its own fakes, until the first adapter runs it (HAL-193).
sandboxCheckContract("fake that can start", {
  make: async () => checkOnlySandbox(null),
  makeUnavailable: async () => checkOnlySandbox("bubblewrap-missing"),
});

sandboxCheckContract("fake on plain Windows", {
  make: async () => checkOnlySandbox("windows"),
  makeUnavailable: async () => checkOnlySandbox("windows"),
});
