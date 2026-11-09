import { describe, expect, it } from "vitest";
import { runExample } from "../examples/leases-values-and-limits.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      firstLease: true,
      secondLease: false,
      valueSet: true,
      valueSetAgain: false,
      counts: [2, 4, 4],
      counterRefused: true,
      windowAllowed: [true, true, false],
      leaseHeldAfterRestart: true,
      counterAfterRestart: 5,
    });
  });
});
