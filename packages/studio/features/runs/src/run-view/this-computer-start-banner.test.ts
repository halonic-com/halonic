import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { context, event, failed } from "./failure-banner.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import type { RunPageContext } from "./run-page-model.ts";

/** The workspace names the agent `writer` Writer. */
const named: RunPageContext = {
  ...context,
  agentName: (id) => (id === "writer" ? "Writer" : undefined),
};

const reason = "a program started without a fence can't reach a bridge on a Unix socket";
const summary = failed("this-computer-start-failed", { error: reason });

/** The log of a run whose launcher refused the step Draft's agent, with that step's start or without it. */
function refusedLog(withStart: boolean) {
  return [
    event({ type: "state.entered", state: "draft" }, 1),
    ...(withStart
      ? [event({ type: "sandbox.started", state: "draft", agent: "writer", timeoutMs: 30_000 }, 2)]
      : []),
    event(
      { type: "run.failed", state: "draft", error: reason, reason: "this-computer-start-failed" },
      3,
    ),
  ];
}

const callout = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner : undefined;

verifies("runs.run-view.this-computer-start", () => {
  describe("a launcher on this computer that didn't start the step's agent", () => {
    const line = `Support reply failed in the step Draft: Writer didn't start on this computer: ${reason}.`;

    it("says what halonic run says, with the agent's name and the launcher's reason", () => {
      const banner = callout(causeBanner(summary, refusedLog(true), named, false));

      expect(banner?.tone).toBe("danger");
      expect(banner?.lines).toEqual([line]);
      expect(banner?.lines.join(" ")).not.toContain("sandbox");
    });

    it("offers Copy details and no Run again, since the launcher would refuse it again", () => {
      const banner = callout(causeBanner(summary, refusedLog(true), named, false));

      expect(banner?.details?.split("\n")).toEqual([line, expect.stringMatching(/^Run /), reason]);
      expect(banner?.noRunAgain).toBe(true);
    });

    it("names an agent the workspace no longer has by its id", () => {
      const banner = callout(causeBanner(summary, refusedLog(true), context, false));

      expect(banner?.lines[0]).toContain(": writer didn't start on this computer: ");
    });

    it("keeps the general banner until the log is read, and for a log without the step's start", () => {
      expect(causeBanner(summary, undefined, named, false)).toBeUndefined();
      expect(causeBanner(summary, refusedLog(false), named, false)).toBeUndefined();
    });
  });
});
