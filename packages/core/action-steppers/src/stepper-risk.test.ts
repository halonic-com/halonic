import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { stepperRisks } from "./stepper-risk.ts";

verifies("action-steppers.requester-policy", () => {
  describe("stepperRisks", () => {
    it("lists the risk levels from lowest to highest", () => {
      expect(stepperRisks).toEqual(["routine", "admin", "irreversible"]);
    });
  });
});
