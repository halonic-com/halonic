import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentHostActivity } from "./agent-activity.ts";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";

const workspace = "/work/acme";
const runsRoute = "POST /v1/messaging/runs";
const pullsRoute = "POST /v1/messaging/pull-requests";
const ada = "paperclip:halonic:agent:ada";
const since = "2026-11-25T00:00:00.000Z";
const adaRuns = {
  source: "paperclip:halonic",
  asOf: "2026-11-25T10:00:00.000Z",
  complete: true,
  runs: [{ id: "paperclip:halonic:run:r1", agent: ada, state: "running", canStop: true }],
};

verifies("agent-host-client.agent-activity", () => {
  describe("AgentHostActivity", () => {
    it("asks for one agent's runs since a time, and passes on the host's items", async () => {
      const host = new FakeHost().answer(runsRoute, ok({ items: [adaRuns] }));

      const runs = await new AgentHostActivity(host, workspace).runs({ agent: ada, since });

      expect(runs).toEqual([adaRuns]);
      expect(host.calls.map((call) => [call.route, call.body])).toEqual([
        [runsRoute, { workspace, agent: ada, since }],
      ]);
    });

    it("sends no agent or bound the query leaves out", async () => {
      const host = new FakeHost().answer(runsRoute, ok({ items: [] }));

      await new AgentHostActivity(host, workspace).runs({});

      expect(host.calls.map((call) => call.body)).toEqual([{ workspace }]);
    });

    it("reads the workspace's pull requests", async () => {
      const list = { source: "paperclip:halonic", repo: "acme", open: [], recent: [] };
      const host = new FakeHost().answer(pullsRoute, ok({ items: [list] }));

      expect(await new AgentHostActivity(host, workspace).pullRequests()).toEqual([list]);
      expect(host.calls.map((call) => [call.route, call.body])).toEqual([
        [pullsRoute, { workspace }],
      ]);
    });

    it("fails with the host's kind when it refuses", async () => {
      const host = new FakeHost().answer(pullsRoute, refused(502, "messaging_failed", "x"));

      await expect(new AgentHostActivity(host, workspace).pullRequests()).rejects.toMatchObject({
        status: 502,
        kind: "messaging_failed",
      });
    });
  });
});
