import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  type JobState,
  longestWaitMs,
  pollMs,
  runStanding,
  runsAhead,
  type TurnDeps,
  waitForTurn,
} from "../lib/live-turn.ts";
import { gitHubGet, runJobs, unfinishedLiveRuns } from "./live-turn.ts";

const step = (name: string, status: string) => ({ name, status });

/** A live-cloud job at a point in its life. */
function liveJob(stage: "waiting" | "suites" | "sweeping" | "finished"): JobState {
  const waitDone = stage === "waiting" ? "in_progress" : "completed";
  const suitesDone = stage === "sweeping" || stage === "finished" ? "completed" : "queued";
  return {
    name: "live-cloud",
    status: stage === "finished" ? "completed" : "in_progress",
    steps: [step("Wait for the account", waitDone), step("Run the live suites", suitesDone)],
  };
}

const planning: JobState[] = [{ name: "What to run", status: "in_progress", steps: [] }];

/** Fake GitHub and clock: each look returns the next entry of `looks`, then the last one forever. */
function fakeDeps(looks: readonly Record<number, JobState[]>[]) {
  let clock = 0;
  let look = 0;
  const lines: string[] = [];
  const jobsAsked: number[] = [];
  const current = () => looks[Math.min(look, looks.length - 1)] ?? {};
  const deps: TurnDeps = {
    unfinishedRuns: async () => [5, ...Object.keys(current()).map(Number)],
    jobs: async (runId) => {
      jobsAsked.push(runId);
      return current()[runId] ?? [];
    },
    sleep: async (milliseconds) => {
      clock += milliseconds;
      look += 1;
    },
    now: () => clock,
    log: (line) => lines.push(line),
  };
  return { deps, lines, jobsAsked };
}

verifies("check.live-turn", () => {
  describe("runStanding", () => {
    test("reads where a run stands from its live job's steps", () => {
      expect(runStanding(planning)).toBe("before");
      expect(runStanding([liveJob("waiting")])).toBe("before");
      expect(runStanding([liveJob("suites")])).toBe("holding");
      expect(runStanding([liveJob("sweeping")])).toBe("done");
      expect(runStanding([liveJob("finished")])).toBe("done");
    });
  });

  describe("runsAhead", () => {
    test("waits for a holder and for lower IDs, never for itself or a done run", () => {
      const standings = new Map([
        [3, "before" as const],
        [4, "done" as const],
        [5, "before" as const],
        [7, "holding" as const],
        [9, "before" as const],
      ]);
      expect(runsAhead(5, standings)).toEqual([3, 7]);
      expect(runsAhead(3, standings)).toEqual([7]);
    });
  });

  describe("waitForTurn", () => {
    test("goes ahead at once when no other run is unfinished", async () => {
      const { deps, lines } = fakeDeps([{}]);
      expect(await waitForTurn(5, deps)).toEqual({ outcome: "turn", waitedMs: 0, ahead: [] });
      expect(lines).toEqual([]);
    });

    test("waits for a higher run holding the account, then goes", async () => {
      const { deps, lines } = fakeDeps([{ 7: [liveJob("suites")] }, { 7: [liveJob("sweeping")] }]);
      expect(await waitForTurn(5, deps)).toEqual({ outcome: "turn", waitedMs: pollMs, ahead: [] });
      expect(lines).toEqual(["live-turn: waiting for run(s) 7 to finish their live suites."]);
    });

    test("waits for a lower run still planning; that run doesn't wait for this one", async () => {
      const { deps } = fakeDeps([
        { 3: planning },
        { 3: [liveJob("suites")] },
        { 3: [liveJob("finished")] },
      ]);
      expect(await waitForTurn(5, deps)).toEqual({
        outcome: "turn",
        waitedMs: 2 * pollMs,
        ahead: [],
      });
      // Run 5 waits its turn; run 3 sees it, lower ID or not, and goes.
      const lower = fakeDeps([{ 5: [liveJob("waiting")] }]);
      expect((await waitForTurn(3, lower.deps)).outcome).toBe("turn");
    });

    test("doesn't ask again for the jobs of a run it saw done", async () => {
      const { deps, jobsAsked } = fakeDeps([
        { 3: [liveJob("sweeping")], 7: [liveJob("suites")] },
        { 3: [liveJob("sweeping")], 7: [liveJob("finished")] },
      ]);
      await waitForTurn(5, deps);
      expect(jobsAsked).toEqual([3, 7, 7]);
    });

    test("gives up after the longest wait and names the runs ahead", async () => {
      const { deps } = fakeDeps([{ 3: [liveJob("suites")] }]);
      expect(await waitForTurn(5, deps)).toEqual({
        outcome: "gave-up",
        waitedMs: longestWaitMs,
        ahead: [3],
      });
    });
  });

  describe("GitHub reads", () => {
    test("collects unfinished runs across statuses, once each", async () => {
      const asked: string[] = [];
      const get = async (path: string) => {
        asked.push(path);
        if (path.includes("status=in_progress")) return { workflow_runs: [{ id: 7 }, { id: 3 }] };
        if (path.includes("status=queued")) return { workflow_runs: [{ id: 7 }, { id: 9 }] };
        return { workflow_runs: [] };
      };
      expect((await unfinishedLiveRuns(get, "acme/halonic")).sort()).toEqual([3, 7, 9]);
      expect(asked).toEqual([
        "/repos/acme/halonic/actions/workflows/live-cloud.yml/runs?status=in_progress&per_page=100",
        "/repos/acme/halonic/actions/workflows/live-cloud.yml/runs?status=queued&per_page=100",
        "/repos/acme/halonic/actions/workflows/live-cloud.yml/runs?status=waiting&per_page=100",
      ]);
    });

    test("reads a run's latest jobs and their steps", async () => {
      const get = async () => ({
        jobs: [
          {
            name: "live-cloud",
            status: "in_progress",
            steps: [{ name: "Wait for the account", status: "completed" }],
          },
        ],
      });
      expect(await runJobs(get, "acme/halonic", 7)).toEqual([
        {
          name: "live-cloud",
          status: "in_progress",
          steps: [step("Wait for the account", "completed")],
        },
      ]);
    });

    test("fails on any answer but 200, naming the status and path", async () => {
      const fetchImpl = (async () => new Response("{}", { status: 403 })) as typeof fetch;
      const get = gitHubGet("token", "https://api.example.test", fetchImpl);
      await expect(get("/repos/acme/halonic")).rejects.toThrow(
        "GitHub answered 403 for GET /repos/acme/halonic.",
      );
    });
  });
});
