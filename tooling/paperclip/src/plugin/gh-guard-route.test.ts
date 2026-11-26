import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import { fakeMetrics } from "./fake-host.test-helper.ts";
import { type GhGuardApi, handleGhGuard } from "./gh-guard-route.ts";
import { manifest } from "./manifest.ts";
import { plugin } from "./worker.ts";

const mateo = {
  actorType: "agent",
  actorId: "agent-mateo",
  agentId: "agent-mateo",
  runId: "run-1",
};
const board = { actorType: "user", actorId: "user-1", userId: "user-1" };

function request(body: unknown, actor: object = mateo): PluginApiRequestInput {
  return {
    routeKey: "gh-guard",
    method: "POST",
    path: "/gh-guard",
    params: {},
    query: { companyId: "acme" },
    body,
    headers: {},
    companyId: "acme",
    actor,
  } as unknown as PluginApiRequestInput;
}

function fakeRoute(config: Record<string, unknown>, metricsFail = false) {
  const { metrics, written } = fakeMetrics(metricsFail);
  const ctx = {
    metrics,
    config: { get: async () => config },
    agents: { get: async (id: string) => (id === "agent-mateo" ? { id, urlKey: "mateo" } : null) },
  } as unknown as GhGuardApi;
  return { ctx, written };
}

verifies("paperclip.gh-guard-route", () => {
  describe("the gh-guard route", () => {
    test("counts a dry run and lets gh run while the setting is off", async () => {
      const { ctx, written } = fakeRoute({});
      const response = await handleGhGuard(request({ subcommand: "pr checks" }), ctx);
      expect(response).toEqual({ status: 200, body: { redirect: false } });
      expect(written).toEqual([
        {
          name: "tools.gh_redirected",
          value: 1,
          tags: { companyId: "acme", subcommand: "pr checks", agent: "mateo", mode: "dry-run" },
        },
      ]);
    });

    test("redirects while the setting is on, except for an exempt agent", async () => {
      const on = fakeRoute({ redirectGhStatusCalls: true });
      expect((await handleGhGuard(request({ subcommand: "pr view" }), on.ctx)).body).toEqual({
        redirect: true,
      });
      expect(on.written[0]?.tags).toEqual(expect.objectContaining({ mode: "redirected" }));
      const exempt = fakeRoute({ redirectGhStatusCalls: true, ghGuardExemptAgents: ["mateo"] });
      expect((await handleGhGuard(request({ subcommand: "run list" }), exempt.ctx)).body).toEqual({
        redirect: false,
      });
      expect(exempt.written[0]?.tags).toEqual(expect.objectContaining({ mode: "exempt" }));
    });

    test("answers the same when the metric doesn't save", async () => {
      const { ctx } = fakeRoute({ redirectGhStatusCalls: true }, true);
      expect((await handleGhGuard(request({ subcommand: "pr list" }), ctx)).body).toEqual({
        redirect: true,
      });
    });

    test("refuses a board user and any other command, and saves nothing", async () => {
      const { ctx, written } = fakeRoute({ redirectGhStatusCalls: true });
      expect((await handleGhGuard(request({ subcommand: "pr view" }, board), ctx)).status).toBe(
        403,
      );
      expect((await handleGhGuard(request({ subcommand: "pr merge" }), ctx)).status).toBe(400);
      expect((await handleGhGuard(request(null), ctx)).status).toBe(400);
      expect(written).toEqual([]);
    });

    test("the manifest declares the route for agents, and the worker answers only it", async () => {
      expect(manifest.apiRoutes?.map((route) => [route.routeKey, route.auth])).toEqual([
        ["gh-guard", "board-or-agent"],
        ["worker-agents", "board"],
        ["github-summary", "board"],
        ["github-pull", "board"],
        ["chat-notes", "board"],
        ["chief-line-open-thread", "board"],
        ["chief-line-thread", "board"],
        ["chief-line-send", "board"],
        ["chief-line-subscribe", "board"],
        ["board-post", "board"],
        ["chief-line-track", "board"],
        ["chief-line-pr-event", "board"],
      ]);
      expect(manifest.capabilities).toContain("api.routes.register");
      const onApiRequest = plugin.definition.onApiRequest;
      if (onApiRequest === undefined) throw new Error("the worker has no onApiRequest");
      const harness = createTestHarness({ manifest, config: {} });
      await plugin.definition.setup(harness.ctx);
      const other = { ...request({ subcommand: "pr view" }), routeKey: "seats.list" };
      expect((await onApiRequest(other)).status).toBe(404);
    });
  });
});
