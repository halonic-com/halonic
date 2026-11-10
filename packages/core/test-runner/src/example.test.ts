import { describe, expect, it } from "vitest";
import { runExample } from "../examples/list-tests.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual([
      "approval › without a decision the run waits (hubs/billing/workflows/approval.test.yaml:6)",
    ]);
  });
});
