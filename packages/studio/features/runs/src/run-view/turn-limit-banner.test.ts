import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { failureWords } from "../failure-words.ts";
import { context, failed } from "./failure-banner.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import { type RunPageContext, runBanner } from "./run-page-model.ts";

/** The workspace names the agent `sorter` Sorter. */
const named: RunPageContext = {
  ...context,
  agentName: (id) => (id === "sorter" ? "Sorter" : undefined),
};

/** A run that failed in the step Draft because `agent` used all `turns` of its model calls. */
function usedUp(agent: string, turns: string) {
  return failed("error", {
    error: `${agent} used all its model calls without finishing.`,
    cause: { code: "engine.turn-limit", detail: { agent, turns } },
  });
}

const callout = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner : undefined;

verifies("runs.run-view.turn-limit", () => {
  describe("an agent that used its model call limit", () => {
    it("says who used how many model calls in which step, as halonic run does", () => {
      const banner = callout(causeBanner(usedUp("sorter", "6"), [], named, false));

      expect(banner?.tone).toBe("danger");
      expect(banner?.lines).toEqual([
        "Sorter used all 6 model calls in the step Draft without finishing.",
      ]);
    });

    it("says its only model call for a limit of 1", () => {
      const banner = callout(causeBanner(usedUp("sorter", "1"), [], named, false));

      expect(banner?.lines).toEqual([
        "Sorter used its only model call in the step Draft without finishing.",
      ]);
    });

    it("offers See the step before Run again", () => {
      const banner = callout(causeBanner(usedUp("sorter", "6"), [], named, false));

      expect(banner?.fixes).toEqual([{ kind: "see-step" }]);
      expect(banner?.noRunAgain).toBeUndefined();
    });

    it("names an agent the workspace no longer has by its id", () => {
      const banner = callout(causeBanner(usedUp("triage-bot", "6"), [], named, false));

      expect(banner?.lines[0]).toMatch(/^Triage-bot used all 6 model calls /);
    });

    it("is shown before the log is read, since the summary holds the cause", () => {
      const banner = callout(causeBanner(usedUp("sorter", "6"), undefined, named, false));

      expect(banner?.lines[0]).toMatch(/^Sorter used all 6 /);
    });

    it("never shows the general banner's words", () => {
      const run = { summary: usedUp("sorter", "6") };
      // As the page picks it: the cause's banner, or else the general one.
      const banner = causeBanner(run.summary, [], named, false) ?? runBanner(run, named);

      expect(JSON.stringify(banner)).not.toContain("can't tell the cause yet");
    });

    it("words the last calls that returned nothing as the CLI does", () => {
      expect(failureWords.turnLimitEmptyCalls("search_docs")).toBe(
        "Its last calls to search_docs returned nothing.",
      );
    });
  });

  it("leaves a cause without the agent or a whole limit to the general banner", () => {
    const noLimit = failed("error", {
      cause: { code: "engine.turn-limit", detail: { agent: "sorter", turns: "many" } },
    });

    expect(causeBanner(noLimit, [], named, false)).toBeUndefined();
  });
});
