import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type SandboxCheck, sandboxVersion } from "./index.ts";

verifies("ports.sandbox-check-setup-again", () => {
  it("is in version 9 of the port", () => {
    expect(sandboxVersion).toBe(9);
  });

  it("says a setup was done for an older release of the backend", () => {
    const check: SandboxCheck = {
      ok: false,
      reason: "setup-needed",
      missing: ["srt's Windows setup is for an older release"],
      setupAgain: true,
    };
    expect(check.ok ? undefined : check.setupAgain).toBe(true);
  });

  it("keeps the flag optional, so an adapter that can't tell compiles unchanged", () => {
    const withoutFlag: SandboxCheck = {
      ok: false,
      reason: "setup-needed",
      missing: ["srt's Windows setup is not done"],
    };
    expect("setupAgain" in withoutFlag).toBe(false);
  });

  it("doesn't compile on a check that works, or with a value other than true", () => {
    const works: SandboxCheck = {
      ok: true,
      reason: null,
      missing: [],
      // @ts-expect-error: a sandbox that can start needs no setup
      setupAgain: true,
    };
    const notSet: SandboxCheck = {
      ok: false,
      reason: "setup-needed",
      missing: [],
      // @ts-expect-error: leave the flag out rather than set it to false
      setupAgain: false,
    };
    expect([works, notSet]).toHaveLength(2);
  });
});
