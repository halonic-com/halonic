import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { treeCost, treeUnpriced } from "./tree-cost.ts";

verifies("app.month-spend", () => {
  it("adds a run's sub-runs, at any depth, to its cost, and nothing from other runs", () => {
    const run = (id: string, parentRunId: string | null, cost: number, unpricedCalls = 0) => ({
      id,
      parentRunId,
      cost,
      unpricedCalls,
    });
    const summaries = [
      run("top", null, 1),
      run("child", "top", 0.5),
      run("grandchild", "child", 0.25, 2),
      run("other", null, 9),
      run("other-child", "other", 9, 9),
    ];

    expect(treeCost(summaries, "top")).toBe(1.75);
    expect(treeCost(summaries, "child")).toBe(0.75);
    expect(treeCost(summaries, "missing")).toBe(0);
    expect(treeUnpriced(summaries, "top")).toBe(2);
    expect(treeUnpriced(summaries, "missing")).toBe(0);
  });
});
