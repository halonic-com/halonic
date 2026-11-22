import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import { type RunPageContext, runBanner } from "./run-page-model.ts";

const context: RunPageContext = {
  workflow: { name: "Review all", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: () => undefined,
  providerName: () => undefined,
  currency: "EUR",
  now: mondayMorning,
};

/** A run whose for-each step Each failed because the run it started for an item waited. */
function itemWaited(detail: Record<string, string>): RunSummary {
  return summaryWith({
    status: "failed",
    reason: "error",
    error: "engine text",
    state: "each",
    cause: { kind: "invalid_input", code: "workflow.item-run-waits", detail },
  });
}

const lines = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;
const fixes = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.fixes : undefined;

verifies("runs.run-view.item-waits-banner", () => {
  describe("an item's run that waited", () => {
    it("says which item's run waited and where to move the wait step, with See the step", () => {
      const banner = causeBanner(
        itemWaited({ workflow: "review-one", item: "1" }),
        undefined,
        context,
        false,
      );
      expect(lines(banner)).toEqual([
        "Review all failed in the step Each: the run it started for item 2 waited, and a run for one item can't wait.",
        "Move the wait step in review-one into this workflow after Each, or take it out of review-one.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "see-step" }]);
    });

    it("keeps the general banner when the cause doesn't name the workflow or the item", () => {
      for (const run of [itemWaited({ item: "1" }), itemWaited({ workflow: "review-one" })]) {
        expect(causeBanner(run, [], context, false)).toBeUndefined();
        const general = runBanner({ summary: run }, context);
        expect(general?.kind === "callout" && general.lines).toEqual([
          "Review all failed in the step Each. Halonic can't tell the cause yet.",
        ]);
      }
    });
  });
});
