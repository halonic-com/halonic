import { checkActionEvent, maxActionValueLength } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { capKeptValues } from "./kept-values.ts";

verifies("action-steppers.kept-values", () => {
  describe("capKeptValues", () => {
    it("cuts a long kept text so the step's event passes its check", () => {
      const kept = capKeptValues({ id: "a".repeat(maxActionValueLength + 200), count: 3 });

      expect(kept["id"]).toHaveLength(maxActionValueLength);
      expect(kept["count"]).toBe(3);
      const check = checkActionEvent({
        type: "action.step.succeeded",
        request: "r1",
        at: "2026-11-26T09:00:00Z",
        step: 1,
        kept,
      });
      expect(check.ok).toBe(true);
    });

    it("leaves short texts, numbers, booleans and null alone", () => {
      const kept = { name: "acme", count: 2, done: true, missing: null };

      expect(capKeptValues(kept)).toEqual(kept);
    });

    it("never cuts through a surrogate pair", () => {
      const kept = capKeptValues({ text: `${"a".repeat(maxActionValueLength - 1)}😀b` });

      expect(kept["text"]).toBe("a".repeat(maxActionValueLength - 1));
    });
  });
});
