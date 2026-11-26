import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkExpect } from "./expect-check.ts";

verifies("action-steppers.expect-check", () => {
  describe("checkExpect", () => {
    it("passes when every expected value matches", () => {
      expect(checkExpect({ headSha: "abc1234" }, { headSha: "abc1234", runId: "42" })).toEqual({
        ok: true,
      });
    });

    it("stops with the changed value named", () => {
      const result = checkExpect({ headSha: "abc1234" }, { headSha: "def5678" });

      expect(result).toEqual({
        ok: false,
        changes: [{ name: "headSha", expected: "abc1234", current: "def5678" }],
        message: "This changed since the request: headSha was abc1234, is now def5678.",
      });
    });

    it("names a value the check no longer finds", () => {
      const result = checkExpect({ headSha: "abc1234", ruleset: "main" }, { headSha: "abc1234" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toBe("This changed since the request: ruleset was main, is now gone.");
    });

    it("doesn't read an inherited property as a current value", () => {
      const result = checkExpect({ toString: "x" }, {});

      expect(result.ok).toBe(false);
    });
  });
});
