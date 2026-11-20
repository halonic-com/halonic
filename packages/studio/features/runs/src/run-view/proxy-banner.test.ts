import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProviderKind } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";
import type { RunPageContext } from "./run-page-model.ts";

const kinds: Record<string, ProviderKind> = { ollama: "local", claude: "cloud" };
const context: RunPageContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: (id) => kinds[id],
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

/** The button every proxy banner has: the how-to, on GitHub until docs.halonic.dev has it. */
const proxyHowTo = {
  kind: "open-external",
  label: "Model calls through a proxy",
  address:
    "https://github.com/halonic-com/halonic/blob/main/docs/how-to/model-calls-through-a-proxy.md",
  opens: "Opens GitHub",
};

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
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toEqual([proxyHowTo]);
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

    it("gives the CLI's lines for a cause without a sentence, and never says offline", () => {
      expect(lines(causeBanner(proxied("proxy.refused"), log, context, false))).toEqual([
        "Halonic couldn't use your proxy from HTTPS_PROXY to reach Claude.",
        "Check HTTPS_PROXY, then run again.",
      ]);
    });

    it("keeps the offline sentence for a cause that isn't the proxy's", () => {
      expect(
        lines(causeBanner(proxied("network.dns", "no such host"), log, context, false))?.[0],
      ).toContain("This computer may be offline.");
    });
  });

  describe("a model the proxy kept out of reach", () => {
    // The same lines as the CLI's (requirement `cli.run-failed-proxy`), as sentences of their own.
    const proxy = "http://127.0.0.1:3128";
    const log = [call("claude", "claude-sonnet"), failedEvent("api.anthropic.com")];
    const throughProxy = (problem: string, detail: Record<string, string>) =>
      lines(
        causeBanner(
          failed("model-unreachable", {
            cause: { kind: "unavailable", code: `proxy.${problem}`, detail },
          }),
          log,
          context,
          false,
        ),
      );

    it("says the setting isn't one Halonic can use, in the variable it came from", () => {
      expect(throughProxy("setting", { variable: "https_proxy" })).toEqual([
        "The proxy setting in https_proxy isn't one Halonic can use, so nothing was sent to Claude.",
        "Set https_proxy to http://host:port, then run again.",
      ]);
    });

    it("names the proxy it couldn't reach", () => {
      expect(throughProxy("unreachable", { variable: "HTTPS_PROXY", proxy })).toEqual([
        "Halonic couldn't reach your proxy http://127.0.0.1:3128 from HTTPS_PROXY, so nothing was sent to Claude.",
        "Start your proxy, or set HTTPS_PROXY to one that runs, then run again.",
      ]);
    });

    it("names the proxy that didn't answer in time", () => {
      expect(throughProxy("timeout", { variable: "HTTPS_PROXY", proxy })).toEqual([
        "Your proxy http://127.0.0.1:3128 from HTTPS_PROXY didn't answer in time, so nothing was sent to Claude.",
        "Start your proxy, or set HTTPS_PROXY to one that runs, then run again.",
      ]);
    });

    it("names the host the proxy refused", () => {
      const detail = { variable: "HTTPS_PROXY", proxy, host: "api.anthropic.com", status: "403" };
      expect(throughProxy("refused", detail)).toEqual([
        "Your proxy http://127.0.0.1:3128 from HTTPS_PROXY refused to connect to api.anthropic.com.",
        "Ask whoever runs your proxy to allow api.anthropic.com, then run again.",
      ]);
    });

    it("says the proxy refused the user name and password, never showing them", () => {
      expect(throughProxy("credentials", { variable: "HTTPS_PROXY", proxy })).toEqual([
        "Your proxy http://127.0.0.1:3128 from HTTPS_PROXY refused the user name and password.",
        "Fix the user name and password in HTTPS_PROXY, then run again.",
      ]);
    });

    it("offers https or NO_PROXY for a plain http host", () => {
      expect(throughProxy("plain-http", { variable: "HTTPS_PROXY", host: "model.test" })).toEqual([
        "Claude is at model.test over plain http, which Halonic never sends through the proxy in HTTPS_PROXY.",
        "Give Claude an https:// baseUrl, or add model.test to NO_PROXY, then run again.",
      ]);
    });

    it("offers the company's certificate for a failed security check", () => {
      const detail = { variable: "HTTPS_PROXY", proxy, host: "api.anthropic.com" };
      expect(throughProxy("insecure", detail)).toEqual([
        "The connection to api.anthropic.com through your proxy http://127.0.0.1:3128 failed its security check.",
        "If your proxy re-signs https, set NODE_EXTRA_CA_CERTS to your company's certificate, then run again.",
      ]);
    });

    it("says to check the variable for a code it doesn't know, or one missing a fact its lines need", () => {
      const other = [
        "Halonic couldn't use your proxy from HTTPS_PROXY to reach Claude.",
        "Check HTTPS_PROXY, then run again.",
      ];
      expect(throughProxy("bad-host", { variable: "HTTPS_PROXY" })).toEqual(other);
      expect(throughProxy("refused", { variable: "HTTPS_PROXY", proxy })).toEqual(other);
      expect(throughProxy("timeout", {})).toEqual(other);
    });

    it("says the same on a phone, with the how-to", () => {
      const banner = causeBanner(
        failed("model-unreachable", {
          cause: { kind: "unavailable", code: "proxy.timeout", detail: { proxy } },
        }),
        [call("ollama", "llama3.2"), failedEvent("localhost:11434")],
        context,
        true,
      );
      expect(lines(banner)).toEqual([
        "Your proxy http://127.0.0.1:3128 from HTTPS_PROXY didn't answer in time, so nothing was sent to Ollama.",
        "Start your proxy, or set HTTPS_PROXY to one that runs, then run again.",
      ]);
      expect(banner?.kind === "callout" ? banner.fixes : undefined).toEqual([proxyHowTo]);
    });

    it("keeps the internet sentence for any other cause", () => {
      const banner = causeBanner(
        failed("model-unreachable", { cause: { kind: "unavailable", code: "network.offline" } }),
        log,
        context,
        false,
      );
      expect(lines(banner)?.[0]).toContain("Check your internet connection");
    });
  });
});
