import { describe, expect, it } from "vitest";
import { runExample } from "../examples/chat-turn.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      answer: "It says: INV-7 is paid",
      roles: ["assistant", "tool", "assistant"],
      model: "acme-1",
    });
  });
});
