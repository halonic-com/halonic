import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { houseRulesText, withHouseRules } from "./house-rules.ts";

verifies("harness-opencode.house-rules", () => {
  describe("withHouseRules", () => {
    it("puts the house rules first, then a blank line, then the prompt unchanged", () => {
      const prompt = "What does hello.txt say?";

      expect(withHouseRules(prompt)).toBe(`${houseRulesText}\n\n${prompt}`);
    });

    it("holds the lab's V53 block word for word", () => {
      expect(houseRulesText.split("\n")).toEqual([
        "HOUSE RULES (read first):",
        "1. Do not edit, weaken or delete existing tests. Add new tests for new behaviour instead.",
        "2. Do not change existing user-facing wording or requirements unless the task explicitly asks for that change.",
        "3. Reuse the repository's existing names, error classes and helpers; do not invent parallel ones.",
        "4. Keep the change to what the task asks.",
      ]);
    });
  });
});
