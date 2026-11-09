import { describe, expect, it } from "vitest";
import { runExample } from "../examples/compare-one-fixture.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual([
      "agent/unknown-key: hubs/billing/agents/clerk.agent.yaml: golden says unrecognized_keys at line 13",
      "same error: matches",
      "error one line further down: differs",
    ]);
  });
});
