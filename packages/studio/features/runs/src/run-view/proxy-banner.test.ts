import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import type { RunPageContext } from "./run-page-model.ts";

const context: RunPageContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: (id) => (id === "claude" ? "cloud" : undefined),
  providerName: (id) => (id === "claude" ? "Claude" : undefined),
  currency: "EUR",
  now: mondayMorning,
};

function event(rest: Record<string, unknown>, seq: number): RunEvent {
  return { runId: "run_a", seq, at: "2026-11-16T08:00:00Z", ...rest } as RunEvent;
}

const call = (provider: string, model: string) =>
  event({ type: "llm.request", agent: "reporter", provider, model, messages: 1 }, 2);
const failedEvent = (host: string) =>
  event({ type: "run.failed", state: "draft", error: "x", host }, 3);

function failed(reason: RunSummary["reason"], changes: Partial<RunSummary> = {}) {
  return summaryWith({
    status: "failed",
    reason,
    error: "engine text",
    state: "draft",
    ...changes,
  });
}

const lines = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;

verifies("runs.run-view.failure-banners", () => {
  describe("at the proxy", () => {
    const proxied = (code: string, message?: string) =>
      failed("model-unreachable", {
        cause: {
          kind: "unavailable",
          code,
          ...(message === undefined ? {} : { detail: { message } }),
        },
      });
    const log = [call("claude", "claude-sonnet"), failedEvent("api.anthropic.com")];

    it.each([
      [
        "proxy.setting",
        "Halonic supports an http:// proxy; yours is socks5://proxy.acme.example:1080. Use http://host:port. Nothing was sent.",
        "Halonic couldn't reach Claude at api.anthropic.com through your proxy: Halonic supports an http:// proxy; yours is socks5://proxy.acme.example:1080. Use http://host:port. Nothing was sent.",
      ],
      [
        "proxy.setting",
        "The proxy setting for proxy.acme.example:3128 has more than host and port in it. Nothing was sent.",
        "Halonic couldn't reach Claude at api.anthropic.com through your proxy: the proxy setting for proxy.acme.example:3128 has more than host and port in it. Nothing was sent.",
      ],
      [
        "proxy.plain-http",
        "the host uses plain http and a proxy is set, so nothing was sent. Use https://, or add the host to NO_PROXY.",
        "Halonic couldn't reach Claude at api.anthropic.com through your proxy: the host uses plain http and a proxy is set, so nothing was sent. Use https://, or add the host to NO_PROXY.",
      ],
      [
        "proxy.unreachable",
        "couldn't reach the host through the proxy: check HTTPS_PROXY and the proxy",
        "Halonic couldn't reach Claude at api.anthropic.com through your proxy. Check HTTPS_PROXY and the proxy.",
      ],
    ])("says it was the proxy for %s, with the shell's sentence", (code, message, line) => {
      const banner = causeBanner(proxied(code, message), log, context, false);
      expect(lines(banner)).toEqual([line]);
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toEqual([
        {
          kind: "open-external",
          label: "Model calls through a proxy",
          address:
            "https://github.com/halonic-com/halonic/blob/main/docs/how-to/model-calls-through-a-proxy.md",
          opens: "Opens GitHub",
        },
      ]);
    });

    it("says an unreachable proxy once, even when the shell's sentence gives nothing more", () => {
      expect(
        lines(
          causeBanner(
            proxied("proxy.unreachable", "couldn't reach the host through the proxy"),
            log,
            context,
            false,
          ),
        ),
      ).toEqual(["Halonic couldn't reach Claude at api.anthropic.com through your proxy."]);
    });

    it("ends at the proxy for a cause without a sentence, and never says offline", () => {
      expect(lines(causeBanner(proxied("proxy.refused"), log, context, false))).toEqual([
        "Halonic couldn't reach Claude at api.anthropic.com through your proxy.",
      ]);
    });

    it("keeps the offline sentence for a cause that isn't the proxy's", () => {
      expect(
        lines(causeBanner(proxied("network.dns", "no such host"), log, context, false))?.[0],
      ).toContain("This computer may be offline.");
    });
  });
});
