import { describe, expect, it } from "vitest";
import { runExample } from "../examples/agents-and-routines.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      sections: ["routines:triggers"],
      shortcut: "agents.new",
      agents: ["reviewer", "writer"],
      section: "triggers",
    });
  });
});
