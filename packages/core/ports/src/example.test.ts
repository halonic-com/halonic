import { describe, expect, it } from "vitest";
import { runExample } from "../examples/a-port-and-an-adapter.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual([
      "Secrets is version 1",
      "2026-01-01T00:00:00.000Z: key set",
      "2026-01-01T00:00:00.000Z: no key",
    ]);
  });
});
