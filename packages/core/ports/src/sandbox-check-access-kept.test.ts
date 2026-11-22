import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type SandboxCheck, sandboxVersion } from "./index.ts";

verifies("ports.sandbox-check-access-kept", () => {
  it("is in the port since version 11", () => {
    expect(sandboxVersion).toBeGreaterThanOrEqual(11);
  });

  it("says the backend still keeps access a removal with administrator rights left", () => {
    const check: SandboxCheck = {
      ok: false,
      reason: "setup-needed",
      missing: ["srt's Windows install is missing"],
      accessKept: true,
    };
    expect(check.ok ? undefined : check.accessKept).toBe(true);
  });

  it("keeps the flag optional, so an adapter that can't tell compiles unchanged", () => {
    const withoutFlag: SandboxCheck = { ok: false, reason: "setup-needed", missing: [] };
    expect("accessKept" in withoutFlag).toBe(false);
  });

  it("doesn't compile on a check that works, or with a value other than true", () => {
    const works: SandboxCheck = {
      ok: true,
      reason: null,
      missing: [],
      // @ts-expect-error: a sandbox that can start keeps nothing to take back
      accessKept: true,
    };
    const notSet: SandboxCheck = {
      ok: false,
      reason: "setup-needed",
      missing: [],
      // @ts-expect-error: leave the flag out rather than set it to false
      accessKept: false,
    };
    expect([works, notSet]).toHaveLength(2);
  });
});
