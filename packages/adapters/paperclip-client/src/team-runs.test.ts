import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentAda, company, plainTask } from "./acme-data.test-helper.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { findRequest, paperclipRequests } from "./requests.ts";
import {
  adaChat,
  adaLive,
  adaMorning,
  connectRuns,
  hiddenText,
  midnight,
  serveRuns,
} from "./team-runs-fixtures.test-helper.ts";

const ada = `paperclip:acme:agent:${agentAda}`;
const runId = (id: string) => `paperclip:acme:run:${id}`;
const acme7 = {
  id: `paperclip:acme:task:${plainTask}`,
  identifier: "ACME-7",
  title: "Ship the site",
};

verifies("paperclip-client.team-runs", () => {
  describe("the run request rows", () => {
    it("are the two run lists, each a GET pinned to its path", () => {
      expect(paperclipRequests.listLiveRuns).toEqual({
        method: "GET",
        path: "/api/companies/:company/live-runs",
      });
      expect(paperclipRequests.listRuns).toEqual({
        method: "GET",
        path: "/api/companies/:company/heartbeat-runs",
      });
    });

    it("reach no stop, log or event route of a run", () => {
      const offList: readonly (readonly [string, string])[] = [
        ["POST", "/api/heartbeat-runs/r1/cancel"],
        ["GET", "/api/heartbeat-runs/r1/log"],
        ["GET", "/api/heartbeat-runs/r1/events"],
        ["GET", "/api/companies/c1/heartbeat-runs/r1"],
        ["POST", "/api/companies/c1/heartbeat-runs"],
      ];
      for (const [method, path] of offList) {
        expect(findRequest(method, path), `${method} ${path}`).toBeUndefined();
      }
    });
  });

  describe("runs", () => {
    it("reads one agent's live runs, then its finished runs since the bound, newest first", async () => {
      const paperclip = serveRuns(new FakePaperclip());
      const [answer] = await connectRuns(paperclip).runs({ agent: ada, since: midnight });

      expect(answer).toEqual({
        source: "paperclip:acme",
        asOf: "2026-11-25T10:00:00.000Z",
        complete: true,
        runs: [
          {
            id: runId(adaLive.id),
            source: "paperclip:acme",
            agent: ada,
            task: acme7,
            state: "running",
            startedAt: "2026-11-25T09:50:00.000Z",
            lastActivityAt: "2026-11-25T09:59:00.000Z",
            canStop: true,
          },
          {
            id: runId(adaChat.id),
            source: "paperclip:acme",
            agent: ada,
            state: "failed",
            startedAt: "2026-11-25T09:00:00.000Z",
            finishedAt: "2026-11-25T09:01:00.000Z",
            lastActivityAt: "2026-11-25T09:01:00.000Z",
            paid: { cents: 0, currency: "USD" },
            tokens: { input: 1000, cached: 5000, output: 200 },
            canStop: false,
          },
          {
            id: runId(adaMorning.id),
            source: "paperclip:acme",
            agent: ada,
            task: acme7,
            state: "succeeded",
            startedAt: "2026-11-25T08:00:00.000Z",
            finishedAt: "2026-11-25T08:10:00.000Z",
            lastActivityAt: "2026-11-25T08:10:00.000Z",
            paid: { cents: 12, currency: "USD" },
            tokens: { input: 1000, cached: 5000, output: 200 },
            canStop: false,
          },
        ],
      });
    });

    it("asks for the finished runs by agent and limit only, and reads each task once", async () => {
      const paperclip = serveRuns(new FakePaperclip());
      const team = connectRuns(paperclip);
      await team.runs({ agent: ada, since: midnight });
      await team.runs({ agent: ada, since: midnight });

      const finishedReads = paperclip.seen.filter((request) =>
        request.path.endsWith("/heartbeat-runs"),
      );
      expect([...(finishedReads[0]?.query ?? [])]).toEqual([
        ["agentId", agentAda],
        ["limit", "200"],
      ]);
      expect(
        paperclip.seen.filter((request) => request.path === `/api/issues/${plainTask}`),
      ).toHaveLength(1);
      for (const request of paperclip.seen) {
        expect(request.method).toBe("GET");
        expect(findRequest(request.method, request.path), request.path).toBeDefined();
      }
    });

    it("reads only the live runs, of every agent, without a bound", async () => {
      const paperclip = serveRuns(new FakePaperclip());
      const [answer] = await connectRuns(paperclip).runs({});

      expect(answer?.runs.map((run) => run.state)).toEqual(["running", "queued"]);
      expect(answer?.runs[1]?.canStop).toBe(false);
      expect(paperclip.seen.some((request) => request.path.endsWith("/heartbeat-runs"))).toBe(
        false,
      );
    });

    it("never copies output excerpts, error text, wake text or the task's description", async () => {
      const paperclip = serveRuns(new FakePaperclip());
      const answer = JSON.stringify(await connectRuns(paperclip).runs({ since: midnight }));

      for (const hidden of [...hiddenText, "log/ref", "secret"]) {
        expect(answer).not.toContain(hidden);
      }
    });

    it("says the answer is not complete when every finished run read is after the bound", async () => {
      const finished = Array.from({ length: 200 }, (_, index) => ({
        ...adaMorning,
        id: `r-${index}`,
      }));
      const paperclip = serveRuns(new FakePaperclip()).on(
        "GET",
        `/api/companies/${company}/heartbeat-runs`,
        { body: finished },
      );
      const [answer] = await connectRuns(paperclip).runs({ agent: ada, since: midnight });

      expect(answer?.complete).toBe(false);
      expect(answer?.runs).toHaveLength(201);
    });

    it("gives an agent of another connection no answer, and sends nothing", async () => {
      const paperclip = serveRuns(new FakePaperclip());
      const other = `paperclip:other:agent:${agentAda}`;

      expect(await connectRuns(paperclip).runs({ agent: other, since: midnight })).toEqual([]);
      expect(paperclip.seen).toEqual([]);
    });

    it("keeps a task the key can't read without a name, and throws on any other failure", async () => {
      const hiddenTask = serveRuns(new FakePaperclip()).on("GET", `/api/issues/${plainTask}`, {
        status: 404,
      });
      const [answer] = await connectRuns(hiddenTask).runs({ agent: ada });
      expect(answer?.runs[0]?.task).toEqual({ id: acme7.id });

      const broken = serveRuns(new FakePaperclip()).on("GET", `/api/issues/${plainTask}`, {
        status: 500,
      });
      await expect(connectRuns(broken).runs({ agent: ada })).rejects.toThrow();
    });
  });
});
