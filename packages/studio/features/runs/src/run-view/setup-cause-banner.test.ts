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

    it("says a provider a model alias names that the workspace doesn't have, with Open Models", () => {
      const run = setupFailure("models.no-provider", { provider: "anthropic", alias: "smart" });
      const banner = causeBanner(run, undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: the model alias smart names the provider anthropic, which the workspace doesn't have.",
        "Add the provider anthropic in Models, or point the model alias smart at a provider the workspace has.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "open-models" }]);
    });

    it("says an agent's provider/model shorthand names a provider it doesn't have", () => {
      const run = setupFailure("models.no-provider", { provider: "mok", model: "mok/echo" });
      const banner = causeBanner(run, undefined, context, true);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: the model mok/echo names the provider mok, which the workspace doesn't have.",
        "Add the provider mok in Models, or give the agent a model from a provider the workspace has.",
        "Fix this on your computer: Models",
      ]);
      expect(fixes(banner)).toBeUndefined();
    });

    it("says for-each items that aren't a list, with the CLI's fix and See the step", () => {
      const notAList = setupFailure("workflow.items-not-a-list", {
        items: "{{input.topics}}",
        gives: "text",
      });
      const banner = causeBanner(notAList, undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: its items ({{input.topics}}) are a text, not a list.",
        'Pass a JSON list, such as ["Monday", "Tuesday"].',
      ]);
      expect(fixes(banner)).toEqual([{ kind: "see-step" }]);

      const nothing = setupFailure("workflow.items-not-a-list", {
        items: "{{steps.find.topics}}",
        gives: "nothing",
      });
      expect(lines(causeBanner(nothing, undefined, context, false))).toEqual([
        "Support reply failed in the step Draft: its items ({{steps.find.topics}}) give nothing.",
        'Read the list from input or context, such as "{{context.steps.find.topics}}".',
      ]);
    });

    it("says an event no arrow is on, and the arrow to add", () => {
      const only = setupFailure("workflow.no-transition", {
        event: "done",
        takes: "approve,reject",
        guarded: "false",
      });
      const banner = causeBanner(only, undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: it ended with the event done, but its arrows are only on approve or reject.",
        "Change one arrow's On event to done, or add an arrow on done.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "see-step" }]);

      const guarded = setupFailure("workflow.no-transition", {
        event: "done",
        takes: "",
        guarded: "true",
      });
      expect(lines(causeBanner(guarded, undefined, context, false))).toEqual([
        "Support reply failed in the step Draft: its arrows on done all have a condition that didn't match.",
        "Add an arrow on done with no condition, as the last one, so the run always has somewhere to go.",
      ]);
    });

    it("names the arrow card's On event in the fix for one arrow, none, or another event", () => {
      const fix = (detail: Record<string, string>) =>
        lines(
          causeBanner(setupFailure("workflow.no-transition", detail), undefined, context, false),
        )?.at(-1);
      expect(fix({ event: "done", takes: "approve" })).toBe(
        "Change the On event of the arrow on approve to done, or add an arrow on done.",
      );
      // The engine leaves `takes` out when the step has no arrows at all.
      expect(fix({ event: "done" })).toBe("Add an arrow from it on its card.");
      expect(fix({ event: "reject", takes: "approve" })).toBe("Add an arrow on reject.");
    });

    it("says an agent step with no agent", () => {
      const run = setupFailure("workflow.task-without-agent", {});
      const banner = causeBanner(run, undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: it's an agent step with no agent.",
        "Pick an agent on its card, or make it a wait step.",
      ]);
      expect(fixes(banner)).toEqual([{ kind: "see-step" }]);
    });

    describe("a key whose addresses leave out its provider's (HAL-15523)", () => {
      const refused = setupFailure("models.key-origin-not-allowed", {
        provider: "gateway",
        key: "gw-key",
        origin: "https://gw.example.com",
      });

      it("names the key and the address, as the CLI does, with Open Models in place of Run again", () => {
        const banner = causeBanner(refused, undefined, context, false);
        expect(lines(banner)).toEqual([
          "Support reply failed in the step Draft: provider gateway can't send key \"gw-key\" to https://gw.example.com. That address isn't allowed for this key.",
          'To allow it, add https://gw.example.com to the addresses of key "gw-key" in Models, then run again. Only allow an address you recognise.',
        ]);
        expect(fixes(banner)).toEqual([{ kind: "open-models" }]);
        expect(banner?.kind === "callout" && banner.noRunAgain).toBe(true);
      });

      it("says to fix it in Models on the computer on a phone, with no button", () => {
        const banner = causeBanner(refused, undefined, context, true);
        expect(lines(banner)?.at(-1)).toBe("Fix this on your computer: Models");
        expect(fixes(banner)).toBeUndefined();
        expect(banner?.kind === "callout" && banner.noRunAgain).toBe(true);
      });
    });

    it("keeps the general banner for a cause nobody knows, or one without its names", () => {
      for (const run of [
        setupFailure("workflow.something-new", { step: "draft" }),
        setupFailure("models.unknown-model-alias", { alias: "smart" }),
        setupFailure("models.no-provider", { alias: "smart" }),
        setupFailure("workflow.items-not-a-list", { items: "{{input.topics}}" }),
        setupFailure("models.key-origin-not-allowed", { provider: "gateway", key: "gw-key" }),
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
