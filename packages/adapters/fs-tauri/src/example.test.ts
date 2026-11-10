import { describe, expect, it } from "vitest";
import { runExample } from "../examples/desktop-trust.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      fingerprint: "hfp1:9f86d081",
      listed: ["/workspaces/acme"],
      afterRevoke: null,
    });
  });
});
