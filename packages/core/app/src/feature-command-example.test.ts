import { expect, it } from "vitest";
import { runExample } from "../examples/feature-command.ts";

it("the README feature command example runs and gives the results its comments promise", async () => {
  expect(await runExample()).toEqual([
    "event: created senior-clerk",
    "agents.create answered senior-clerk",
  ]);
});
