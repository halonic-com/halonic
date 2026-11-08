import { describe, expect, it } from "vitest";
import { runExample } from "../examples/parse-and-export.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      value: { name: "prod", host: "local" },
      problems: ["too_small name", "unrecognized_keys"],
      required: ["name"],
    });
  });
});
