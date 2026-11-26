import type { SyncDiagnostics } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostSyncDiagnostics } from "./sync-diagnostics.ts";

const route = "GET /v1/sync/diagnostics";
const none = { count: 0, share: 0 };
const diagnostics: SyncDiagnostics = {
  windowMs: 60_000,
  updates: { event: none, poll: { count: 2, share: 1 }, "catch-up": none, write: none },
  eventLag: { count: 0, p50Ms: null, p95Ms: null },
  pollLag: { count: 2, p50Ms: 900, p95Ms: 4000 },
  missedByEvents: 0,
  reconnects: 0,
  connection: "polling-only",
  timeIn: { connected: 0, "polling-only": 60_000, "not-allowed": 0 },
  routes: [
    {
      method: "GET",
      route: "companies/:company/issues",
      count: 6,
      p50Ms: 310,
      p95Ms: 900,
      failed: 0,
      bytes: 4096,
    },
  ],
};

verifies("agent-host-client.sync-diagnostics", () => {
  describe("AgentHostSyncDiagnostics", () => {
    it("reads the host's counts and timings", async () => {
      const host = new FakeHost().answer(route, ok(diagnostics));

      expect(await new AgentHostSyncDiagnostics(host).read()).toEqual(diagnostics);
      expect(host.calls.map((call) => call.route)).toEqual([route]);
    });

    it("refuses an answer of another shape", async () => {
      const host = new FakeHost().answer(route, ok({ ...diagnostics, title: "Ship it" }));

      await expect(new AgentHostSyncDiagnostics(host).read()).rejects.toThrow();
    });

    it("fails when the host refuses", async () => {
      const host = new FakeHost().answer(route, refused(404, "not_found", "x"));

      await expect(new AgentHostSyncDiagnostics(host).read()).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
