import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { removalAfterHelper, removalBeforeHelper } from "./after-helper.ts";
import type { RemovalSteps } from "./elevate-helper.ts";
import { HELPER_CANCELLED } from "./elevate-helper.ts";

/** The user's half of a removal, with what it was asked kept. */
function steps(elevated: boolean, failed: string[] = []) {
  const asked = { forgetAll: 0 };
  const given: RemovalSteps = {
    elevated: async () => elevated,
    forgetAll: async () => {
      asked.forgetAll++;
      return failed;
    },
  };
  return { given, asked };
}

const quiet = () => {};

verifies("sandbox-srt.removal-around-helper", () => {
  describe("the user's half before the shell's helper", () => {
    it("takes back the kept grants, then lets the shell start the helper", async () => {
      const { given, asked } = steps(false);
      expect(await removalBeforeHelper("win32", given, quiet)).toEqual({ ok: true });
      expect(asked.forgetAll).toBe(1);
    });

    it("fails, so the shell asks nothing, when a grant stays recorded", async () => {
      const { given } = steps(false, ["a folder is in use"]);
      const result = await removalBeforeHelper("win32", given, quiet);
      expect(result).toMatchObject({ ok: false, outcome: "failed" });
      expect(result.ok ? "" : result.reason).toContain("a folder is in use");
    });

    it("skips the grants with administrator rights, and logs that it did", async () => {
      const { given, asked } = steps(true);
      const logged: string[] = [];
      expect(await removalBeforeHelper("win32", given, (line) => logged.push(line))).toEqual({
        ok: true,
      });
      expect(asked.forgetAll).toBe(0);
      expect(logged).toHaveLength(1);
    });

    it("has nothing to do off Windows", async () => {
      const { given, asked } = steps(false);
      expect(await removalBeforeHelper("linux", given, quiet)).toEqual({ ok: true });
      expect(asked.forgetAll).toBe(0);
    });
  });

  describe("how the removal ended, from the helper's exit code", () => {
    it("is done for 0", () => {
      expect(removalAfterHelper(0)).toEqual({ ok: true });
    });

    it("says the prompt was cancelled for the helper's cancelled code", () => {
      expect(removalAfterHelper(HELPER_CANCELLED)).toMatchObject({
        ok: false,
        outcome: "cancelled",
      });
    });

    it("gives the helper's reason sentence and code for any other code", () => {
      expect(removalAfterHelper(36)).toEqual({
        ok: false,
        outcome: "failed",
        reason: "the sandbox program couldn't start",
        code: 36,
      });
      expect(removalAfterHelper(99)).toEqual({
        ok: false,
        outcome: "failed",
        reason: "the sandbox removal stopped with an error",
        code: 99,
      });
    });
  });
});
