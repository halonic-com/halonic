import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkExpect } from "./expect-check.ts";

verifies("action-steppers.expect-check", () => {
  describe("checkExpect", () => {
    it("passes when every expected value matches", () => {
      expect(checkExpect({ headSha: "abc1234" }, { headSha: "abc1234", runId: 42 })).toEqual({
        ok: true,
      });
    });

    it("stops naming the changed value, with the values kept out of the sentence", () => {
      const result = checkExpect({ headSha: "abc1234" }, { headSha: "def5678" });

      expect(result).toEqual({
        ok: false,
        changes: [{ name: "headSha", expected: "abc1234", current: "def5678" }],
        message: 'This changed since the request: "headSha".',
      });
    });

    it("names every change, including a value the check no longer finds", () => {
      const result = checkExpect({ headSha: "abc1234", ruleset: "main" }, { headSha: "def5678" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toBe('This changed since the request: "headSha", "ruleset".');
      expect(result.changes[1]).toEqual({ name: "ruleset", expected: "main", current: undefined });
    });

    it("treats a number and the same digits as text as different", () => {
      expect(checkExpect({ runId: 1 }, { runId: "1" }).ok).toBe(false);
    });

    it("cuts a long name in the message", () => {
      const result = checkExpect({ ["n".repeat(100)]: "x" }, {});

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toBe(`This changed since the request: "${"n".repeat(39)}…".`);
    });

    it("doesn't read an inherited property as a current value", () => {
      expect(checkExpect({ toString: "x" }, {}).ok).toBe(false);
    });
  });
});
