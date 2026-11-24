import type { Usage } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { treeCost, treeUnpriced, treeUsage } from "./tree-cost.ts";

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

verifies("app.tree-usage", () => {
  it("adds a run's sub-runs' tokens, at any depth, and nothing from other runs", () => {
    const run = (id: string, parentRunId: string | null, usage: Usage) => ({
      id,
      parentRunId,
      usage,
    });
    const summaries = [
      run("top", null, { inputTokens: 100, outputTokens: 20 }),
      run("child", "top", { inputTokens: 10, outputTokens: 2, cacheReadTokens: 5 }),
      run("grandchild", "child", { inputTokens: 1, outputTokens: 1 }),
      run("other", null, { inputTokens: 9000, outputTokens: 900 }),
      run("other-child", "other", { inputTokens: 9000, outputTokens: 900 }),
    ];

    expect(treeUsage(summaries, "top")).toEqual({
      inputTokens: 111,
      outputTokens: 23,
      cacheReadTokens: 5,
    });
    expect(treeUsage(summaries, "child")).toEqual({
      inputTokens: 11,
      outputTokens: 3,
      cacheReadTokens: 5,
    });
    expect(treeUsage(summaries, "missing")).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
