import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { SandboxCheck } from "./index.ts";
import { sandboxUnavailableReasons } from "./index.ts";

// Type tests too: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.sandbox-check-reason", () => {
  it("names a closed list of reasons, with other as the fallback", () => {
    expect(sandboxUnavailableReasons).toEqual([
      "windows",
      "container",
      "not-supported",
      "blocked-by-policy",
      "virtualisation-off",
      "wsl-missing",
      "restart-needed",
      "distro-missing",
      "setup-conflict",
      "setup-needed",
      "user-namespaces-restricted",
      "bubblewrap-missing",
      "linux-tools-missing",
      "ripgrep-missing",
      "sign-in-needed",
      "not-offered",
      "other",
    ]);
  });

  it("gives a reason when the sandbox can't start, and null when it can", () => {
    const refused: SandboxCheck = {
      ok: false,
      reason: "user-namespaces-restricted",
      missing: ["unprivileged user namespaces are restricted"],
    };
    const works: SandboxCheck = { ok: true, reason: null, missing: [] };
    expect([refused.reason, works.reason]).toEqual(["user-namespaces-restricted", null]);
  });

  it("takes version 6's codes for setup, WSL, company policy and sign-in", () => {
    const refusals: SandboxCheck[] = [
      { ok: false, reason: "setup-needed", missing: ["srt's Windows install is missing"] },
      { ok: false, reason: "distro-missing", missing: ["Halonic's WSL distro isn't imported"] },
      { ok: false, reason: "blocked-by-policy", missing: ["a group policy turns WSL off"] },
      { ok: false, reason: "sign-in-needed", missing: ["no Docker account is signed in"] },
    ];
    expect(refusals.map((check) => check.reason)).toEqual([
      "setup-needed",
      "distro-missing",
      "blocked-by-policy",
      "sign-in-needed",
    ]);
  });

  it("takes version 8's code for a backend the app doesn't offer here", () => {
    const refused: SandboxCheck = {
      ok: false,
      reason: "not-offered",
      missing: ["this app has no session outside the sandbox"],
    };
    expect(refused.reason).toBe("not-offered");
  });

  it("doesn't compile with a reason that isn't listed", () => {
    // @ts-expect-error: adapters return only listed reasons
    const unlisted: SandboxCheck = { ok: false, reason: "no-kernel", missing: [] };
    expect(unlisted).toBeDefined();
  });

  it("doesn't compile when ok and reason disagree", () => {
    // @ts-expect-error: a sandbox that can start gives no reason
    const okWithReason: SandboxCheck = { ok: true, reason: "windows", missing: [] };
    // @ts-expect-error: a sandbox that can't start says why
    const refusedWithoutReason: SandboxCheck = { ok: false, reason: null, missing: ["no fence"] };
    // @ts-expect-error: a sandbox that can start misses nothing
    const okMissing: SandboxCheck = { ok: true, reason: null, missing: ["bubblewrap"] };
    expect([okWithReason, refusedWithoutReason, okMissing]).toHaveLength(3);
  });
});
