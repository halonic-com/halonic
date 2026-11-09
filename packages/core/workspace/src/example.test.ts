import { describe, expect, it } from "vitest";
import { runExample } from "../examples/load-a-workspace.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      agents: ["billing/clerk"],
      issues: ["hubs/billing/agents/checker.agent.yaml:3 output.type invalid_union"],
      ignored: ["README.md"],
    });
  });
});
