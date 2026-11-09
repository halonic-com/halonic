import { describe, expect, it } from "vitest";
import { runExample } from "../examples/run-a-contract-suite.ts";

// The suites register their cases while this file loads, so they run in this file's test run.
const suites = runExample();

describe("the README example", () => {
  it("names the suites it registered, which run in this file", () => {
    expect(suites).toEqual([
      "Clock contract: std fixedClock",
      "IdGenerator contract: std fixedIds",
    ]);
  });
});
