import { describe, expect, it } from "vitest";
import { runExample } from "../examples/refuse-private-answer.ts";

describe("the README example", () => {
  it("runs and gives the result its comments promise", async () => {
    expect(await runExample()).toBe("address-not-allowed");
  });
});
