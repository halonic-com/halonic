import { describe, expect, it } from "vitest";
import { runExample } from "../examples/check-answer.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      allowed: ["93.184.215.14"],
      refused: [
        { address: "10.0.0.5", class: "private" },
        { address: "::ffff:127.0.0.1", class: "reserved" },
      ],
    });
  });
});
