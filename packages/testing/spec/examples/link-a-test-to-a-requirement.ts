import { expect, test } from "vitest";
import { requirementIdPattern, verifies } from "../src/index.ts";

// Call this at the top level of a test file, with the ID from the requirement file.
export function declareTests(requirementId: string): void {
  verifies(requirementId, () => {
    test("fires once the delay has passed", () => {
      expect(1 + 1).toBe(2);
    });
  });
}

// requirementIdPattern is the same check verifies() makes on its ID.
export function runExample() {
  let badIdMessage = "";
  try {
    verifies("Timer_Fires", () => {});
  } catch (error) {
    badIdMessage = (error as Error).message;
  }
  return {
    goodId: requirementIdPattern.test("workflow.timer-fires-after-delay"),
    badId: requirementIdPattern.test("Timer_Fires"),
    badIdMessage, // "Timer_Fires" is not a requirement ID. Use <package>[.<sub-feature>].<name> …
  };
}
