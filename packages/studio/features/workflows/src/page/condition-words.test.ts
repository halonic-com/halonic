import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { conditionWords } from "./condition-words.ts";

verifies("workflows.page.step-arrows", () => {
  it("reads a comparison with the run's data by its name", () => {
    expect(conditionWords({ equals: ["{{context.category}}", "refund"] })).toBe(
      "category = refund",
    );
    expect(conditionWords({ notEquals: ["{{ input.lang }}", "en"] })).toBe("input.lang ≠ en");
    expect(conditionWords({ gte: ["{{context.total}}", 100] })).toBe("total ≥ 100");
    expect(conditionWords({ contains: ["{{context.tags}}", "vip"] })).toBe("tags contains vip");
  });

  it("reads exists, not, all and any, bracketing a list inside a list", () => {
    expect(conditionWords({ exists: "context.email" })).toBe("email is set");
    expect(conditionWords({ not: { exists: "input.file" } })).toBe("not (input.file is set)");
    expect(
      conditionWords({
        all: [
          { equals: ["{{context.category}}", "refund"] },
          { any: [{ gt: ["{{context.total}}", 100] }, { exists: "context.vip" }] },
        ],
      }),
    ).toBe("category = refund and (total > 100 or vip is set)");
  });

  it("reads a condition the format doesn't have as its JSON", () => {
    expect(conditionWords({ near: [1, 2] })).toBe('{"near":[1,2]}');
    expect(conditionWords("yes")).toBe('"yes"');
  });
});
