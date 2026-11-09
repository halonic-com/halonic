import { describe, expect, it } from "vitest";
import { runExample } from "../examples/parse-an-agent.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      name: "Clerk",
      warnings: 0,
      problems: ["schema invalid_union at 3:9"],
      saved: { name: "Clerk", output: { type: "text" } },
    });
  });
});
