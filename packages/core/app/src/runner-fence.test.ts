import { type SandboxCheck, sandboxUnavailableReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  mxcFencesLocalTools,
  mxcFencesRunner,
  runnerFence,
  runnerUnfencedReasons,
} from "./runner-fence.ts";

const passes: SandboxCheck = { ok: true, reason: null, missing: [] };

verifies("app.runner-fence", () => {
  describe("on Windows", () => {
    it("is not fenced, even when the agent sandbox is set up and its fence proof passes", () => {
      expect(runnerFence({ platform: "win32", check: passes, proof: { state: "fenced" } })).toEqual(
        { state: "not-fenced", reason: "windows" },
      );
      expect(runnerFence({ platform: "win32", check: passes })).toEqual({
        state: "not-fenced",
        reason: "windows",
      });
    });

    it.each(["other", "setup-needed", "setup-conflict", "not-supported"] as const)(
      "says windows whatever the check's own reason, here %s",
      (reason) => {
        const check: SandboxCheck = { ok: false, reason, missing: ["seccomp"] };
        expect(runnerFence({ platform: "win32", check })).toEqual({
          state: "not-fenced",
          reason: "windows",
        });
      },
    );
  });

  it.each([
    "container",
    "user-namespaces-restricted",
    "bubblewrap-missing",
    "linux-tools-missing",
    "ripgrep-missing",
    "other",
  ] as const)("is not fenced with the check's reason %s", (reason) => {
    const check: SandboxCheck = { ok: false, reason, missing: ["what is missing"] };
    expect(runnerFence({ platform: "linux", check })).toEqual({ state: "not-fenced", reason });
  });

  it.each(["darwin", "linux"])("is fenced on %s when the check passes", (platform) => {
    expect(runnerFence({ platform, check: passes })).toEqual({ state: "fenced" });
    expect(runnerFence({ platform, check: passes, proof: { state: "fenced" } })).toEqual({
      state: "fenced",
    });
  });

  it("stops, and never runs without the sandbox, when the proof fails after the check passed", () => {
    const failed = { state: "not-fenced", reason: "the canary file was readable" } as const;
    expect(runnerFence({ platform: "linux", check: passes, proof: failed })).toEqual({
      state: "stopped",
    });
    expect(runnerFence({ platform: "darwin", check: passes, proof: { state: "stopped" } })).toEqual(
      { state: "stopped" },
    );
  });

  it("has a reason for every reason the sandbox check gives", () => {
    expect(runnerUnfencedReasons).toEqual(expect.arrayContaining([...sandboxUnavailableReasons]));
  });

  it("counts MXC as a fence for the runner but not for local tools, which have no Node layer", () => {
    expect(mxcFencesRunner).toBe(true);
    expect(mxcFencesLocalTools).toBe(false);
  });
});

verifies("app.runner-fence-no-sandbox", () => {
  const failing: SandboxCheck = { ok: false, reason: "container", missing: [] };

  it.each([
    ["win32", passes],
    ["linux", passes],
    ["linux", failing],
  ])("is not fenced with no-sandbox on %s, whatever the check says", (platform, check) => {
    expect(runnerFence({ platform, check, proof: { state: "fenced" }, noSandbox: true })).toEqual({
      state: "not-fenced",
      reason: "no-sandbox",
    });
  });

  it("keeps the usual status when the person didn't choose no sandbox", () => {
    expect(runnerFence({ platform: "win32", check: passes, noSandbox: false })).toEqual({
      state: "not-fenced",
      reason: "windows",
    });
  });

  it("lists no-sandbox as a reason of its own", () => {
    expect(runnerUnfencedReasons).toContain("no-sandbox");
  });
});
