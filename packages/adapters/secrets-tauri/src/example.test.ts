import { describe, expect, it } from "vitest";
import { runExample } from "../examples/desktop-keychain.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({ readBack: true, afterRemove: null });
  });
});
