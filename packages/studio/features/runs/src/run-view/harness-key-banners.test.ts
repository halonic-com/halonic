import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { context, event, failed, lines } from "./failure-banner.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import type { RunPageContext } from "./run-page-model.ts";

/** The workspace's names: Anthropic's and Z.ai's provider files, and the agent Writer. */
const named: RunPageContext = {
  ...context,
  providerName: (id) => ({ claude: "Anthropic", zai: "Z.ai" })[id],
  agentName: (id) => (id === "writer" ? "Writer" : undefined),
};

/** A run Studio stopped before its harness agent's bridge opened, with the cause it named. */
function refused(code: string, detail: Record<string, string>): RunSummary {
  return failed("error", { cause: { kind: "invalid_input", code, detail } });
}

const noKey = refused("harness-host.no-key", {
  provider: "claude",
  secret: "anthropic-key",
  agent: "writer",
  harness: "claude-code",
});
const baseUrl = refused("studio.harness-base-url", { provider: "zai" });
const startedWriter = [event({ type: "agent.started", state: "draft", agent: "writer" }, 1)];

const callout = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner : undefined;

verifies("runs.run-view.failure-banners", () => {
  describe("a sandboxed harness agent's key Studio refused", () => {
    it("says the key isn't on this computer, naming the provider, the agent and its program, with Add key", () => {
      const banner = callout(causeBanner(noKey, undefined, named, false));

      expect(banner?.lines).toEqual([
        "Anthropic has no API key on this computer, and Writer needs one to run in Claude Code.",
      ]);
      expect(banner?.fixes).toEqual([{ kind: "open-models", label: "Add key" }]);
      expect(banner?.noRunAgain).toBeUndefined();
    });

    it("says where to add the key on a phone, with no button", () => {
      const banner = callout(causeBanner(noKey, undefined, named, true));

      expect(banner?.lines).toEqual([
        "Anthropic has no API key on this computer, and Writer needs one to run in Claude Code.",
        "Fix this on your computer: Models",
      ]);
      expect(banner?.fixes).toBeUndefined();
    });

    it("says Studio can't reach the provider's Base URL yet, with the command that runs it, and no Run again", () => {
      const banner = callout(causeBanner(baseUrl, startedWriter, named, false));

      expect(banner?.lines).toEqual([
        "Writer didn't start: Studio can't send its model calls to Z.ai's Base URL yet. Nothing ran.",
        "To run it, run this in a terminal:",
        "halonic run support-reply",
      ]);
      expect(banner?.fixes).toEqual([
        { kind: "copy-command", command: "halonic run support-reply" },
      ]);
      expect(banner?.noRunAgain).toBe(true);
    });

    it("says to run it from the command line on a phone", () => {
      expect(lines(causeBanner(baseUrl, startedWriter, named, true))).toEqual([
        "Writer didn't start: Studio can't send its model calls to Z.ai's Base URL yet. Nothing ran.",
        "Run it from the command line on your computer.",
      ]);
    });

    it("names a provider without a name by its id, and an agent the log doesn't name as the agent", () => {
      expect(lines(causeBanner(baseUrl, [], context, false))?.[0]).toBe(
        "The agent didn't start: Studio can't send its model calls to zai's Base URL yet. Nothing ran.",
      );
    });

    it("waits for the log for the Base URL, and keeps the general banner for a cause without its provider", () => {
      expect(causeBanner(baseUrl, undefined, named, false)).toBeUndefined();
      const noProvider = refused("harness-host.no-key", { secret: "anthropic-key" });
      expect(causeBanner(noProvider, [], named, false)).toBeUndefined();
    });
  });
});
