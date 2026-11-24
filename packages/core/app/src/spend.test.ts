import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { forbiddenImportsOf } from "./entry-imports.spec.ts";
import * as root from "./index.ts";
import * as spend from "./spend.ts";

// Only value names are compared: type-only names don't exist at runtime.
verifies("app.month-spend", () => {
  it("reaches no yaml, no package root and no workspace past trust-url", () => {
    expect(forbiddenImportsOf(join(import.meta.dirname, "spend.ts"))).toEqual([]);
  });

  it("adds up a month with the main entry point's own functions", () => {
    expect(spend.lastMonths).toBe(root.lastMonths);
    expect(spend.monthOf).toBe(root.monthOf);
    expect(spend.monthStartOf).toBe(root.monthStartOf);
    expect(spend.spendByMonth).toBe(root.spendByMonth);
  });
});

verifies("app.tree-usage", () => {
  it("adds up a run tree with the main entry point's own functions", () => {
    expect(spend.treeCost).toBe(root.treeCost);
    expect(spend.treeUnpriced).toBe(root.treeUnpriced);
    expect(spend.treeUsage).toBe(root.treeUsage);
  });
});
