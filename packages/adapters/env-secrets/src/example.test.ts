import { describe, expect, it } from "vitest";
import { runExample } from "../examples/cli-chain.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      fromEnvironment: "env-value",
      fromKeychain: "keychain-value",
      notConfigured: null,
    });
  });
});
