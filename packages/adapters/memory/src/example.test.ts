import { describe, expect, it } from "vitest";
import { runExample } from "../examples/workspace-timers-and-leases.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      files: ["hubs/a/hub.yaml", "workspace.yaml"],
      blobText: "hello",
      firedBefore: [],
      firedAfter: ["wake-up"],
      firstLease: true,
      secondLease: false,
      leaseAfterExpiry: true,
    });
  });
});
