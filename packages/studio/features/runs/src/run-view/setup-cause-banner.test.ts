import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import { type RunPageContext, runBanner } from "./run-page-model.ts";

const context: RunPageContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: () => undefined,
  providerName: () => undefined,
  currency: "EUR",
  now: mondayMorning,
};

/** A run the engine failed before its first step, naming the setup cause. */
function setupFailure(code: string, detail: Record<string, string>): RunSummary {
  return summaryWith({
    status: "failed",
    reason: "error",
    error: "engine text",
    state: "draft",
    cause: { kind: "not_found", code, detail },
  });
}

const lines = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;
const fixes = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.fixes : undefined;

verifies("runs.run-view.failure-banners", () => {
  describe("a setup cause the engine names", () => {
    it("says a provider type Halonic can't call, as the CLI does, with Open Models", () => {
      const run = setupFailure("models.unknown-provider-type", {
        provider: "mock",
        type: "antropic",
      });
      const banner = causeBanner(run, undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: provider mock has type antropic, which Halonic can't call.",
        "Pick a type Halonic knows for mock in Models, then run again.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "open-models" }]);
    });

    it("says a model alias the hub doesn't have, with Open Models", () => {
      const run = setupFailure("models.unknown-model-alias", { alias: "smart", hub: "support" });
      const banner = causeBanner(run, undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: hub support has no model alias smart.",
        "Add it in Models, or set a model on the agent.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "open-models" }]);
    });

    it("says where to fix it on a phone, with no button", () => {
      const run = setupFailure("models.unknown-model-alias", { alias: "smart", hub: "support" });
      const banner = causeBanner(run, undefined, context, true);
      expect(lines(banner)?.at(-1)).toBe("Fix this on your computer: Models");
      expect(fixes(banner)).toBeUndefined();
    });

    it("keeps the general banner for a cause nobody knows, or one without its names", () => {
      for (const run of [
        setupFailure("workflow.something-new", { step: "draft" }),
        setupFailure("models.unknown-model-alias", { alias: "smart" }),
      ]) {
        expect(causeBanner(run, [], context, false)).toBeUndefined();
        const general = runBanner({ summary: run }, context);
        expect(general?.kind === "callout" && general.lines).toEqual([
          "Support reply failed in the step Draft. Halonic can't tell the cause yet.",
        ]);
      }
    });
  });
});
