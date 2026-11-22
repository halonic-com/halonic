import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const agent = (...lines: string[]) => yaml("id: coder", "name: Coder", ...lines);

verifies("format.agent-answer-retries", () => {
  it("leaves the field out of a minimal agent", () => {
    expect(parsedValue("agent", agent())).not.toHaveProperty("answerRetries");
  });

  it.each([0, 1])("reads answerRetries: %i", (retries) => {
    expect(parsedValue("agent", agent(`answerRetries: ${retries}`)).answerRetries).toBe(retries);
  });

  describe("refuses a value outside 0 to 1, at its own field", () => {
    it.each([
      ["2", "answerRetries too_big 3"],
      ["-1", "answerRetries too_small 3"],
      ["0.5", "answerRetries invalid_type 3"],
    ])("answerRetries: %s", (value, problem) => {
      expect(summary(problemsOf("agent", agent(`answerRetries: ${value}`)))).toEqual([problem]);
    });
  });
});
