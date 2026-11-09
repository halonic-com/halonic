import { describe, expect, it } from "vitest";
import { runExample } from "../examples/run-a-tool-on-a-fake-host.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      result: '{"city":"Ghent","summary":"Light rain, 11 degrees"}',
      sentTo: "https://api.acme.example/v1/forecast?city=Ghent",
      authorizationPlaced: true,
      keyInResult: false,
      logged: 1,
    });
  });
});
