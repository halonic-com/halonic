import type { SandboxCheck } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setupAfterHelper } from "./after-helper.ts";
import { HELPER_CANCELLED } from "./elevate-helper.ts";

const passes = async (): Promise<SandboxCheck> => ({ ok: true, reason: null, missing: [] });

verifies("sandbox-srt.setup-after-helper", () => {
  describe("a setup the shell ran through the helper", () => {
    it("is done only when the helper exited with 0 and the check passes", async () => {
      expect(await setupAfterHelper(0, passes)).toEqual({ ok: true });
    });

    it("isn't done when the check doesn't pass after an exit code of 0", async () => {
      const missing = async (): Promise<SandboxCheck> => ({
        ok: false,
        reason: "setup-needed",
        missing: ["the sandbox account"],
      });
      expect(await setupAfterHelper(0, missing)).toEqual({
        ok: false,
        outcome: "check_failed",
        reason: "the sandbox account",
      });
    });

    it("reads a check that throws as a failed check", async () => {
      const throws = async (): Promise<SandboxCheck> => {
        throw new Error("srt-win didn't answer");
      };
      expect(await setupAfterHelper(0, throws)).toEqual({
        ok: false,
        outcome: "check_failed",
        reason: "srt-win didn't answer",
      });
    });

    it("says the prompt was cancelled for the helper's cancelled code, without a check", async () => {
      let checked = false;
      const result = await setupAfterHelper(HELPER_CANCELLED, async () => {
        checked = true;
        return passes();
      });
      expect(result).toMatchObject({ ok: false, outcome: "cancelled" });
      expect(checked).toBe(false);
    });

    it("gives the helper's reason sentence and code for any other code, without a check", async () => {
      let checked = false;
      const result = await setupAfterHelper(33, async () => {
        checked = true;
        return passes();
      });
      expect(result).toEqual({
        ok: false,
        outcome: "failed",
        reason:
          "Halonic's copy of the sandbox program has been changed, so it wasn't run. Reinstall Halonic",
        code: 33,
      });
      expect(checked).toBe(false);
    });
  });
});
