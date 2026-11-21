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

verifies("sandbox-srt.windows-setup-again", () => {
  describe("SrtSandbox.check on Windows with a setup for an older srt", () => {
    it("says setup-needed with setupAgain when the setup is there but older", async () => {
      const machine = { ...windows("setup-needed"), windowsSetupOutdated: async () => true };
      const check = await new SrtSandbox(machine).check();
      expect(check).toMatchObject({ ok: false, reason: "setup-needed", setupAgain: true });
      expect(check.missing[0]).toContain("older srt");
    });

    it("leaves setupAgain out without a setup, or on a machine that doesn't say", async () => {
      const none = { ...windows("setup-needed"), windowsSetupOutdated: async () => false };
      expect(await new SrtSandbox(none).check()).toEqual({
        ok: false,
        reason: "setup-needed",
        missing: [
          "srt's Windows install is missing; run `srt windows-install` once as an administrator",
        ],
      });
      const silent = await new SrtSandbox(windows("setup-needed")).check();
      expect(silent).not.toHaveProperty("setupAgain");
    });

    it("leaves setupAgain out when srt's status can't be read, and still says setup-needed", async () => {
      const machine = {
        ...windows("setup-needed"),
        windowsSetupOutdated: async () => {
          throw new Error("srt-win did not answer");
        },
      };
      const check = await new SrtSandbox(machine).check();
      expect(check).toMatchObject({ ok: false, reason: "setup-needed" });
      expect(check).not.toHaveProperty("setupAgain");
    });
  });
});
