import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentAda, company, plainTask } from "./acme-data.test-helper.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import {
  adaMorning,
  connectRuns,
  midnight,
  runsNow,
  serveRuns,
} from "./team-runs-fixtures.test-helper.ts";

const ada = `paperclip:acme:agent:${agentAda}`;
const taskReads = (paperclip: FakePaperclip) =>
  paperclip.seen.filter((request) => request.path.startsWith("/api/issues/"));

/** Ada's finished runs, one per task named `tasks`. */
function finishedOn(paperclip: FakePaperclip, tasks: readonly string[]): FakePaperclip {
  const runs = tasks.map((task, index) => ({ ...adaMorning, id: `r-${index}`, issueId: task }));
  return paperclip.on("GET", `/api/companies/${company}/heartbeat-runs`, { body: runs });
}

verifies("paperclip-client.team-run-bounds", () => {
  describe("the task-name reads", () => {
    it("send at most 50, at most 4 at a time, and the other tasks keep their IDs", async () => {
      const tasks = Array.from({ length: 60 }, (_, index) => `t-${index}`);
      const paperclip = finishedOn(serveRuns(new FakePaperclip()), tasks);
      for (const task of tasks) {
        paperclip.on("GET", `/api/issues/${task}`, {
          body: { id: task, identifier: task.toUpperCase(), title: "A task" },
        });
      }
      let inFlight = 0;
      let mostInFlight = 0;
      const countingFetch = async (input: Request | string | URL, init?: RequestInit) => {
        inFlight += 1;
        mostInFlight = Math.max(mostInFlight, inFlight);
        try {
          // One turn of the event loop, so reads sent together overlap.
          await Promise.resolve();
          return await paperclip.fetch(input, init);
        } finally {
          inFlight -= 1;
        }
      };
      const team = connectRuns(paperclip, { fetch: countingFetch });
      const [answer] = await team.runs({ agent: ada, since: midnight });

      expect(taskReads(paperclip).length).toBeLessThanOrEqual(50);
      expect(mostInFlight).toBeGreaterThan(1);
      expect(mostInFlight).toBeLessThanOrEqual(4);
      expect(answer?.runs).toHaveLength(61);
      expect(answer?.runs.every((run) => run.task !== undefined)).toBe(true);
    });

    it("read a name again once it is more than 10 minutes old", async () => {
      const paperclip = serveRuns(new FakePaperclip());
      let now = runsNow;
      const team = connectRuns(paperclip, { now: () => now });
      await team.runs({ agent: ada });
      now = new Date(runsNow.getTime() + 5 * 60_000);
      await team.runs({ agent: ada });
      expect(taskReads(paperclip)).toHaveLength(1);

      now = new Date(runsNow.getTime() + 11 * 60_000);
      await team.runs({ agent: ada });
      expect(taskReads(paperclip)).toHaveLength(2);
    });

    it("keep a task the key may not read (403) with its ID and no name", async () => {
      const paperclip = serveRuns(new FakePaperclip()).on("GET", `/api/issues/${plainTask}`, {
        status: 403,
        body: { error: "Forbidden" },
      });
      const [answer] = await connectRuns(paperclip).runs({ agent: ada });

      expect(answer?.runs[0]?.task).toEqual({ id: `paperclip:acme:task:${plainTask}` });
    });

    it("leave out a task whose ID can't be a path segment, and don't read it", async () => {
      const paperclip = finishedOn(serveRuns(new FakePaperclip()), ["acme task"]);
      const [answer] = await connectRuns(paperclip).runs({ agent: ada, since: midnight });

      const finished = answer?.runs.find((run) => run.id === "paperclip:acme:run:r-0");
      expect(finished).toBeDefined();
      expect(finished?.task).toBeUndefined();
      expect(taskReads(paperclip).some((request) => request.path.includes("acme"))).toBe(false);
    });
  });

  it("refuses a `since` that isn't a time, before any request", async () => {
    const paperclip = serveRuns(new FakePaperclip());

    await expect(connectRuns(paperclip).runs({ since: "yesterday" })).rejects.toThrow(RangeError);
    expect(paperclip.seen).toEqual([]);
  });
});
