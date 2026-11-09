import { describe, expect, it } from "vitest";
import { runExample } from "../examples/replay-one-exchange.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual([
      '200 {"widgets":["sprocket","gear"]}',
      "no recording for GET api.acme.example/v1/gadgets as request 2: the recording has no more exchanges",
      "exchanges not asked for: 0",
    ]);
  });
});
