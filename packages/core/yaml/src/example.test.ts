import { describe, expect, it } from "vitest";
import { runExample } from "../examples/read-and-edit.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      position: { line: 4, col: 9 },
      problem: "unsupported at 1:13",
      edited: `# Nightly billing check
name: Billing
steps:
  - id: check # runs first
    model: fast
`,
      layout: "kept",
      written: "name: Billing\nsteps:\n  - id: check\n    model: slow\n",
    });
  });
});
