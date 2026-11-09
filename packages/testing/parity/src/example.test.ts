import { describe, expect, it } from "vitest";
import { runExample } from "../examples/compare-one-fixture.ts";

describe("the README example", () => {
  // Reads every fixture file: on a slow disk under load that took up to 31 s, past the 5 s default.
  it("runs and gives the results its comments promise", { timeout: 120_000 }, () => {
    expect(runExample()).toEqual([
      "agent/unknown-key: hubs/billing/agents/clerk.agent.yaml: golden says unrecognized_keys at line 13",
      "same error: matches",
      "error one line further down: differs",
    ]);
  });
});
