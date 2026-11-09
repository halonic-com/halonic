import { describe, expect, it } from "vitest";
import { runExample } from "../examples/read-a-run-log.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      workflowId: "triage",
      status: "running",
      state: "classify",
      statesVisited: ["classify"],
      lastSeq: 4,
      entries: [1, 2, 3, 3],
    });
  });
});
