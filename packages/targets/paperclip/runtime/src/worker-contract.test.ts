import { verifies } from "@halonicjs/testing-spec";
import * as protocol from "@paperclipai/plugin-sdk/protocol";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { afterEach, describe, expect, test, vi } from "vitest";
import { type PluginSdk, sdkHost } from "./sdk-host.test-helper.ts";
import { probeKey, probeSecret, probeSetup } from "./worker-probe.test-helper.ts";

/** The plugin SDK, as the test host uses it. */
const sdk: PluginSdk = { ...protocol, createTestHarness };

// Contract tests: our worker client against Paperclip's side as the plugin
// SDK's own test harness and protocol helpers implement it.

const allCapabilities = [
  "agent.tools.register",
  "plugin.state.read",
  "plugin.state.write",
  "secrets.read-ref",
  "http.outbound",
  "agents.read",
  "metrics.write",
];

async function initialized(config: Record<string, unknown> = {}) {
  const host = sdkHost(sdk, { capabilities: allCapabilities, setup: probeSetup, config });
  const answer = await host.initialize();
  expect(answer).toMatchObject({ result: { ok: true, supportedMethods: [] } });
  return host;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

verifies("runtime.worker-protocol", () => {
  describe("the worker client against the plugin SDK's harness", () => {
    test("initialize sets the plugin up, and health and a tool call answer", async () => {
      const host = await initialized();

      expect(await host.request("health", {})).toMatchObject({ result: { status: "ok" } });
      expect(await host.executeTool({ kind: "echo", text: "hello" })).toMatchObject({
        result: { content: "ok", data: "hello" },
      });
    });

    test("state: a value set comes back, and Paperclip's state holds it", async () => {
      const host = await initialized();

      const answer = await host.executeTool({ kind: "state", value: { seen: 3 } });

      expect(answer).toMatchObject({ result: { data: { seen: 3 } } });
      expect(host.harness.getState(probeKey)).toEqual({ seen: 3 });
      expect(await host.executeTool({ kind: "state-delete" })).toMatchObject({
        result: { data: null },
      });
    });

    test("config: the plugin's settings come back as Paperclip holds them", async () => {
      const host = await initialized({ githubToken: probeSecret });

      expect(await host.executeTool({ kind: "config" })).toMatchObject({
        result: { data: { githubToken: probeSecret } },
      });
    });

    test("secrets: the reference resolves to what Paperclip answers", async () => {
      const host = await initialized();
      const expected = await host.harness.ctx.secrets.resolve(probeSecret);

      expect(await host.executeTool({ kind: "secret" })).toMatchObject({
        result: { data: expected },
      });
    });

    test("http: Paperclip makes the request with its headers and the body comes back", async () => {
      const sent: { url: string; authorization: string | null }[] = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        sent.push({ url, authorization: new Headers(init.headers).get("authorization") });
        return new Response("Keep it logically awesome.", { status: 200 });
      });
      const host = await initialized();

      const answer = await host.executeTool({ kind: "http", token: "acme-token" });

      expect(answer).toMatchObject({ result: { data: "200 Keep it logically awesome." } });
      expect(sent).toEqual([
        { url: "https://api.github.com/zen", authorization: "Bearer acme-token" },
      ]);
    });

    test("metrics: the metric reaches Paperclip", async () => {
      const host = await initialized();

      await host.executeTool({ kind: "metric" });

      expect(host.harness.metrics).toEqual([
        { name: "probe.calls", value: 1, tags: { tool: "probe" } },
      ]);
    });

    test("agents: the caller's url key and name come back", async () => {
      const host = await initialized();
      const mateo = { id: "agent-mateo", companyId: "acme", urlKey: "mateo", name: "Mateo" };
      host.harness.seed({ agents: [mateo as never] });

      expect(await host.executeTool({ kind: "agent" })).toMatchObject({
        result: { data: { urlKey: "mateo", name: "Mateo" } },
      });
    });

    test("a call back made for a tool call echoes the invocation id Paperclip scopes it by", async () => {
      const host = await initialized();

      await host.executeTool({ kind: "metric" }, { paperclipInvocation: { id: "invocation-7" } });

      const callBack = host.written.find(
        (message) => (message as { method?: string }).method === "metrics.write",
      );
      expect(callBack).toMatchObject({ paperclipInvocationId: "invocation-7" });
    });

    test("shutdown answers and ends the worker", async () => {
      const host = await initialized();

      expect(await host.request("shutdown", {})).toMatchObject({ result: null });
      await expect(host.worker.done).resolves.toBeUndefined();
    });
  });
});
