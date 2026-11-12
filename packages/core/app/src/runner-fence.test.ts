import { type SandboxCheck, sandboxUnavailableReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runnerFence, runnerUnfencedReasons } from "./runner-fence.ts";

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

    it("says windows whatever the check's own reason", () => {
      const check: SandboxCheck = { ok: false, reason: "other", missing: ["seccomp"] };
      expect(runnerFence({ platform: "win32", check })).toEqual({
        state: "not-fenced",
        reason: "windows",
      });
    });
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
});
