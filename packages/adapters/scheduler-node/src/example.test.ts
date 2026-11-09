import { describe, expect, it } from "vitest";
import { runExample } from "../examples/timers-that-survive-a-restart.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      pendingBeforeRestart: ["wait"],
      deliveredBeforeDue: [],
      deliveredWhenDue: ["run_1/wait"],
      pendingAfterDelivery: 0,
      errors: 0,
    });
  });
});
