import { describe, expect, it } from "vitest";
import { runExample } from "../examples/desktop-secrets.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({ inShell: true, readBack: true, asSecret: null });
  });
});
