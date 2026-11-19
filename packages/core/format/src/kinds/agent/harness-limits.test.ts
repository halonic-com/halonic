import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const agent = (...lines: string[]) => yaml("id: coder", "name: Coder", ...lines);

verifies("format.agent-harness-limits", () => {
  it("leaves the block out of a minimal agent, whose maxSteps stays 6", () => {
    const value = parsedValue("agent", agent());
    expect(value).not.toHaveProperty("harnessLimits");
    expect(value.maxSteps).toBe(6);
  });

  it("reads all three limits", () => {
    const value = parsedValue(
      "agent",
      agent(
        "harness: claude-code",
        "harnessLimits: { maxSteps: 150, maxMinutes: 20, maxCost: 2.5 }",
      ),
    );
    expect(value.harnessLimits).toEqual({ maxSteps: 150, maxMinutes: 20, maxCost: 2.5 });
  });

  it("reads one limit alone", () => {
    const value = parsedValue("agent", agent("harnessLimits: { maxMinutes: 20 }"));
    expect(value.harnessLimits).toEqual({ maxMinutes: 20 });
  });

  describe("refuses a value outside its bounds, at its own field", () => {
    it.each([
      ["maxSteps: 0", "harnessLimits.maxSteps too_small 3"],
      ["maxSteps: 10001", "harnessLimits.maxSteps too_big 3"],
      ["maxMinutes: 1.5", "harnessLimits.maxMinutes invalid_type 3"],
      ["maxMinutes: 1441", "harnessLimits.maxMinutes too_big 3"],
      ["maxCost: 0", "harnessLimits.maxCost too_small 3"],
    ])("%s", (field, problem) => {
      expect(summary(problemsOf("agent", agent(`harnessLimits: { ${field} }`)))).toEqual([problem]);
    });
  });

  it("refuses a field the block doesn't have", () => {
    expect(summary(problemsOf("agent", agent("harnessLimits: { maxTokens: 10 }")))).toEqual([
      "harnessLimits unrecognized_keys 3",
    ]);
  });
});
