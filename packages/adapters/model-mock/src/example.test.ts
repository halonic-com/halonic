import { describe, expect, it } from "vitest";
import { runExample } from "../examples/scripted-agent.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample()).toEqual({
      toolCalls: [{ id: "mock_call_1", name: "search_handbook", arguments: { query: "refund" } }],
      answer: "Refunds take 5 days.",
      left: { support: 0 },
    });
  });
});
