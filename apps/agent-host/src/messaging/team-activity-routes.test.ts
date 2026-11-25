import { AgentHostActivity } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";
import { teamRunsFetchGapMs } from "./team-runs-memory.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** The desktop with `halonic` connected, as Studio connects it. */
async function connected(): Promise<Desktop> {
  desktop = await startDesktop();
  await desktop.paperclipKey.handOver({
    workspace: desktop.workspace,
    connection: "halonic",
    key: testKey,
    ...acme,
  });
  return desktop;
}

/** Text Paperclip sends with a run that must never reach Studio. */
const hidden = {
  stdoutExcerpt: "made-up stdout",
  error: "made-up error",
  logRef: "made-up/log/ref.ndjson",
};

/** Ada working on task-1 now, on the helper's clock (24 Nov, 14:00 UTC). */
const adaNow = {
  ...hidden,
  id: "run-ada-now",
  agentId: "agent-ada",
  status: "running",
  issueId: "task-1",
  startedAt: "2026-11-24T13:50:00.000Z",
  lastEventAt: "2026-11-24T13:59:00.000Z",
  execution: { canStop: true },
};

/** Ada's run this morning, and one from yesterday that today's bound leaves out. */
const adaMorning = {
  ...hidden,
  id: "run-ada-morning",
  agentId: "agent-ada",
  status: "succeeded",
  startedAt: "2026-11-24T09:00:00.000Z",
  finishedAt: "2026-11-24T09:20:00.000Z",
};
const adaYesterday = {
  ...adaMorning,
  id: "run-ada-yesterday",
  startedAt: "2026-11-23T09:00:00.000Z",
};

const midnight = "2026-11-24T00:00:00.000Z";

function asked(on: Desktop, path: string): number {
  return on.paperclip.seen.filter((request) => request.url.endsWith(path)).length;
}

verifies("agent-host.team-activity-routes", () => {
  describe("POST /v1/messaging/runs", () => {
    it("gives Ada's live run and today's earlier ones, without their text", async () => {
      const on = await connected();
      on.paperclip.liveRuns = [adaNow];
      on.paperclip.runs = [adaNow, adaMorning, adaYesterday];
      const [ada] = await on.studio.listAgents();

      const answers = await new AgentHostActivity(on.transport, on.workspace).runs({
        agent: ada?.id ?? "",
        since: midnight,
      });

      expect(answers).toMatchObject([
        {
          source: "paperclip:halonic",
          complete: true,
          runs: [
            { state: "running", task: { identifier: "ACME-7", title: "Chat with Ada" } },
            { state: "succeeded", finishedAt: adaMorning.finishedAt },
          ],
        },
      ]);
      const text = on.answers.join("\n");
      for (const value of Object.values(hidden)) expect(text).not.toContain(value);
      expect(text).not.toContain(testKey);
    });

    it("asks Paperclip once within 10 seconds, and again after", async () => {
      const on = await connected();
      on.paperclip.liveRuns = [adaNow];
      const activity = new AgentHostActivity(on.transport, on.workspace);

      await Promise.all([activity.runs({}), activity.runs({})]);
      await on.wait(teamRunsFetchGapMs - 1_000);
      await activity.runs({});
      expect(asked(on, "/live-runs")).toBe(1);

      await on.wait(1_000);
      await activity.runs({});
      expect(asked(on, "/live-runs")).toBe(2);
    });

    it("keeps runs in memory only, never in the profile folder", async () => {
      const on = await connected();
      on.paperclip.liveRuns = [adaNow];
      on.paperclip.runs = [adaNow, adaMorning];
      const activity = new AgentHostActivity(on.transport, on.workspace);

      await activity.runs({ since: midnight });
      await activity.pullRequests();

      const files = [...(await on.filesIn(on.profile)).values()].join("\n");
      expect(files).not.toContain("run-ada");
      expect(files).not.toContain("ACME-7");
    });

    it("stands in the last answer, marked as cached, while Paperclip can't be reached", async () => {
      const on = await connected();
      on.paperclip.liveRuns = [adaNow];
      const activity = new AgentHostActivity(on.transport, on.workspace);
      await activity.runs({});

      on.paperclip.offline = true;
      await on.wait(teamRunsFetchGapMs);

      expect(await activity.runs({})).toMatchObject([
        { fromCache: true, runs: [{ state: "running" }] },
      ]);
    });

    it("refuses a bound that isn't a time, and a field it doesn't know, asking nobody", async () => {
      const on = await connected();
      const before = on.paperclip.seen.length;

      const notATime = await on.transport.request("POST /v1/messaging/runs", {
        workspace: on.workspace,
        since: "yesterday",
      });
      const unknownField = await on.transport.request("POST /v1/messaging/runs", {
        workspace: on.workspace,
        log: true,
      });

      expect([notATime.status, unknownField.status]).toEqual([400, 400]);
      expect(on.paperclip.seen.length).toBe(before);
    });

    it("answers 502 with no detail when Paperclip can't be reached, and logs why", async () => {
      const on = await connected();
      on.paperclip.offline = true;

      const answer = await on.transport.request("POST /v1/messaging/runs", {
        workspace: on.workspace,
      });

      expect(answer).toMatchObject({ status: 502, body: { error: { kind: "messaging_failed" } } });
      expect(on.logged.join("")).toContain("/v1/messaging/runs");
    });

    it("answers 404 for a folder that isn't a workspace", async () => {
      const on = await connected();

      const answer = await on.transport.request("POST /v1/messaging/runs", {
        workspace: "/work/elsewhere",
      });

      expect(answer.status).toBe(404);
    });
  });

  describe("POST /v1/messaging/pull-requests", () => {
    it("deletes the pull requests kept for a connection when it is disconnected", async () => {
      const on = await connected();
      await new AgentHostActivity(on.transport, on.workspace).pullRequests();
      const teamFiles = async () =>
        [...(await on.filesIn(on.profile)).keys()].filter((path) => path.includes("team-status"));
      expect(await teamFiles()).not.toEqual([]);

      await on.paperclipKey.disconnect({ workspace: on.workspace, connection: "halonic" });

      expect(await teamFiles()).toEqual([]);
    });
  });
});
