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
import { gitHubGet, runJobs, turnReport, unfinishedLiveRuns } from "./live-turn.ts";

const step = (name: string, status: string) => ({ name, status });

/** A live-cloud job at a point in its life. */
function liveJob(stage: "queued" | "waiting" | "suites" | "sweeping" | "finished"): JobState {
  if (stage === "queued") {
    return { name: "live-cloud", status: "queued", steps: [] };
  }
  const waitDone = stage === "waiting" ? "in_progress" : "completed";
  const suitesDone = stage === "sweeping" || stage === "finished" ? "completed" : "queued";
  return {
    name: "live-cloud",
    status: stage === "finished" ? "completed" : "in_progress",
    steps: [step("Wait for the account", waitDone), step("Run the live suites", suitesDone)],
  };
}

const planning: JobState[] = [{ name: "What to run", status: "in_progress", steps: [] }];

/**
 * Fake GitHub and clock: each look returns the next entry of `looks`, then the
 * last one forever. `attempts` gives a run's attempt per look (default 1).
 */
function fakeDeps(
  looks: readonly Record<number, JobState[]>[],
  attempts: readonly Record<number, number>[] = [],
) {
  let clock = 0;
  let look = 0;
  const lines: string[] = [];
  const jobsAsked: number[] = [];
  const current = () => looks[Math.min(look, looks.length - 1)] ?? {};
  const deps: TurnDeps = {
    unfinishedRuns: async () =>
      [5, ...Object.keys(current()).map(Number)].map((id) => ({
        id,
        attempt: attempts[Math.min(look, attempts.length - 1)]?.[id] ?? 1,
      })),
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
      expect(runStanding(planning)).toBe("unstarted");
      expect(runStanding([liveJob("queued")])).toBe("unstarted");
      expect(runStanding([liveJob("waiting")])).toBe("waiting");
      expect(runStanding([liveJob("suites")])).toBe("holding");
      expect(runStanding([liveJob("sweeping")])).toBe("done");
      expect(runStanding([liveJob("finished")])).toBe("done");
    });

    test("counts a holder cancelled mid-suites as done", () => {
      const cancelled: JobState = {
        name: "live-cloud",
        status: "completed",
        steps: [
          step("Wait for the account", "completed"),
          step("Run the live suites", "in_progress"),
        ],
      };
      expect(runStanding([cancelled])).toBe("done");
    });
  });

  describe("runsAhead", () => {
    test("waits for a holder and for lower waiting IDs, never for itself or a done run", () => {
      const standings = new Map([
        [3, "waiting" as const],
        [4, "done" as const],
        [5, "waiting" as const],
        [7, "holding" as const],
        [9, "waiting" as const],
      ]);
      expect(runsAhead(5, standings)).toEqual([3, 7]);
      expect(runsAhead(3, standings)).toEqual([7]);
    });

    test("doesn't wait for a lower run that has no runner yet", () => {
      const standings = new Map([
        [2, "unstarted" as const],
        [3, "waiting" as const],
      ]);
      expect(runsAhead(5, standings)).toEqual([3]);
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

    test("waits for a lower run waiting its turn; that run doesn't wait for this one", async () => {
      const { deps } = fakeDeps([
        { 3: [liveJob("waiting")] },
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

    test("goes ahead of a lower run still planning or queued for a runner", async () => {
      const { deps } = fakeDeps([{ 2: planning, 3: [liveJob("queued")] }]);
      expect(await waitForTurn(5, deps)).toEqual({ outcome: "turn", waitedMs: 0, ahead: [] });
      // Once run 3 has a runner, it waits for run 5 holding the account.
      const later = fakeDeps([{ 5: [liveJob("suites")] }, { 5: [liveJob("finished")] }]);
      expect(await waitForTurn(3, later.deps)).toEqual({
        outcome: "turn",
        waitedMs: pollMs,
        ahead: [],
      });
    });

    test("doesn't ask again for the jobs of a run it saw done", async () => {
      const { deps, jobsAsked } = fakeDeps([
        { 3: [liveJob("sweeping")], 7: [liveJob("suites")] },
        { 3: [liveJob("sweeping")], 7: [liveJob("finished")] },
      ]);
      await waitForTurn(5, deps);
      expect(jobsAsked).toEqual([3, 7, 7]);
    });

    test("looks again at a run seen done once a new attempt of it starts", async () => {
      const { deps, jobsAsked } = fakeDeps(
        [
          { 3: [liveJob("sweeping")], 7: [liveJob("suites")] },
          { 3: [liveJob("suites")], 7: [liveJob("finished")] },
          { 3: [liveJob("finished")], 7: [liveJob("finished")] },
        ],
        [{ 3: 1 }, { 3: 2 }],
      );
      expect(await waitForTurn(5, deps)).toEqual({
        outcome: "turn",
        waitedMs: 2 * pollMs,
        ahead: [],
      });
      expect(jobsAsked).toEqual([3, 7, 3, 7, 3]);
    });

    test("goes ahead with the error when GitHub can't be read, keeping who was ahead", async () => {
      const { deps } = fakeDeps([{ 7: [liveJob("suites")] }]);
      let looks = 0;
      const failing: TurnDeps = {
        ...deps,
        unfinishedRuns: async () => {
          looks += 1;
          if (looks > 1) {
            throw new Error("GitHub answered 403 for GET /repos/acme/halonic.");
          }
          return deps.unfinishedRuns();
        },
      };
      const result = await waitForTurn(5, failing);
      expect(result).toEqual({
        outcome: "unreadable",
        waitedMs: pollMs,
        ahead: [7],
        error: "GitHub answered 403 for GET /repos/acme/halonic.",
      });
      expect(turnReport(result)).toBe(
        "::warning title=Live cloud turn::Couldn't read the other live-cloud runs (GitHub answered 403 for GET /repos/acme/halonic.); going ahead without its turn after 2 min, so D1 may refuse work under the load (HAL-13840).",
      );
    });

    test("gives up after the longest wait and names the runs ahead", async () => {
      const { deps } = fakeDeps([{ 3: [liveJob("suites")] }]);
      expect(await waitForTurn(5, deps)).toEqual({
        outcome: "gave-up",
        // The first look at or past the longest wait.
        waitedMs: Math.ceil(longestWaitMs / pollMs) * pollMs,
        ahead: [3],
      });
    });
  });

  describe("GitHub reads", () => {
    test("lists the unfinished runs in one call, with their current attempt", async () => {
      const asked: string[] = [];
      const get = async (path: string) => {
        asked.push(path);
        return {
          workflow_runs: [
            { id: 9, status: "queued", run_attempt: 1 },
            { id: 8, status: "completed", run_attempt: 1 },
            { id: 7, status: "in_progress", run_attempt: 2 },
            { id: 6, status: "requested", run_attempt: 1 },
            { id: 4, status: "pending" },
          ],
        };
      };
      expect(await unfinishedLiveRuns(get, "acme/halonic")).toEqual([
        { id: 9, attempt: 1 },
        { id: 7, attempt: 2 },
        { id: 6, attempt: 1 },
        { id: 4, attempt: 1 },
      ]);
      expect(asked).toEqual([
        "/repos/acme/halonic/actions/workflows/live-cloud.yml/runs?per_page=100",
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
