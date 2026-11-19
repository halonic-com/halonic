import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Machine, WindowsSandboxState } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";
import { endedProgram, linux, makeProfile } from "./srt-session.test-helper.ts";

/** A Windows machine whose srt install is in `state`; nothing else is asked of it here. */
function windows(
  state: WindowsSandboxState,
  profileReadGranted: Machine["profileReadGranted"] = async () => false,
): Machine {
  return {
    ...linux,
    platform: "win32",
    windowsSandboxState: async () => state,
    profileReadGranted,
  };
}

const profile = makeProfile("/contract", { env: {}, timeLimitMs: 1000 });

verifies("sandbox-srt.check", () => {
  describe("SrtSandbox.check on Windows", () => {
    it("reports setup-conflict, not setup-needed, for an install whose loopback mode isn't closed, and opens nothing", async () => {
      const sandbox = new SrtSandbox(windows("setup-conflict"), {
        run: async () => endedProgram(0),
      });
      const check = await sandbox.check();
      expect(check).toMatchObject({ ok: false, reason: "setup-conflict" });
      expect(check.missing[0]).toContain("loopback");
      await expect(sandbox.open(profile)).rejects.toThrow("can't start");
    });

    it("reports kept-roots-readable for another program's setup with the profile read grant, and for one it can't read (HAL-5398, S4)", async () => {
      const foreign = await new SrtSandbox(windows("ok", async () => true)).check();
      expect(foreign).toEqual({
        ok: true,
        reason: null,
        missing: [],
        residuals: ["kept-roots-readable"],
      });
      const unreadable = await new SrtSandbox(
        windows("ok", async () => {
          throw new Error("srt-win did not answer");
        }),
      ).check();
      expect(unreadable).toMatchObject({ ok: true, residuals: ["kept-roots-readable"] });
    });

    it("reports no residual for a setup Halonic owns, without the profile read grant", async () => {
      expect(await new SrtSandbox(windows("ok")).check()).toEqual({
        ok: true,
        reason: null,
        missing: [],
      });
    });
  });
});
