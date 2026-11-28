import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agents, type FakeTask, task } from "./fakes.test-helper.ts";
import { mateoBranch, open, setup } from "./handoff.test-helper.ts";
import type { Reviewer } from "./handoff.ts";
import { rerouteChoice } from "./reroute.ts";
import type { Limit, ReviewerLimits } from "./reviewer-limits.ts";

/** The limit-aware review route (HAL-19203). The pass runs at 17:00 UTC. */

const parked: Limit = { why: "pool wait", since: "2026-11-24T16:40:00Z" };
const atLimit: Limit = { why: "usage limit", since: "2026-11-24T16:30:00Z" };

/** Limits by agent id; anyone not named is free. */
function limitsOf(byAgent: Record<string, Limit | "unknown">): ReviewerLimits {
  return async (agentId) => byAgent[agentId];
}

function watcher(options: {
  held?: FakeTask;
  byPaths?: Reviewer;
  limits?: Record<string, Limit | "unknown">;
  extra?: Partial<PullFacts>;
  branch?: string;
}) {
  const branch = options.branch ?? mateoBranch;
  return setup({
    tasks: [options.held ?? task(5701, agents.liam, { branch })],
    pulls: [open(5701, branch, options.extra)],
    byPaths: options.byPaths ?? "julian",
    limits: limitsOf(options.limits ?? { [agents.liam]: parked }),
  });
}

function notes(run: ReturnType<typeof watcher>, start: string): string[] {
  return (run.comments["task-5701"] ?? [])
    .map(({ body }) => body)
    .filter((body) => body.startsWith(start));
}

verifies("paperclip.pr-watcher-reroute", () => {
  test("moves a parked Liam's review to Julian within his scope, once over two passes", async () => {
    const run = watcher({});
    expect(await run.run()).toMatchObject({ rerouted: 1, bothLimited: 0, failed: [] });
    expect(await run.run()).toMatchObject({ rerouted: 0, failed: [] });
    expect(run.handoffs).toEqual([
      {
        taskId: "task-5701",
        from: agents.liam,
        to: agents.julian,
        key: "halonic-com/halonic#5701 5701aaa reroute julian",
      },
    ]);
    expect(notes(run, "PR watcher: Liam")[0]?.split("\n").slice(0, 2)).toEqual([
      "PR watcher: Liam is parked on a pool wait since 24 Nov 17:40 CET, so this review goes to Julian now (HAL-19203):",
      "- [#5701](https://github.com/halonic-com/halonic/pull/5701), head `5701aaa`",
    ]);
  });

  test("leaves a review outside Julian's scope with Liam", async () => {
    const run = watcher({ byPaths: "liam" });
    expect(await run.run()).toMatchObject({ rerouted: 0, bothLimited: 0 });
    expect(run.handoffs).toEqual([]);
    expect(run.lines).toContain("HAL-5701: Liam is limited, but it stays (outside julian)");
  });

  test("moves a limited Julian's review to Liam, whatever its paths", async () => {
    const run = watcher({
      held: task(5701, agents.julian, { branch: mateoBranch }),
      byPaths: "liam",
      limits: { [agents.julian]: atLimit },
    });
    expect(await run.run()).toMatchObject({ rerouted: 1 });
    expect(run.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
    expect(notes(run, "PR watcher: Julian")[0]?.split("\n")[0]).toBe(
      "PR watcher: Julian is at a seat or usage limit since 24 Nov 17:30 CET, so this review goes to Liam now (HAL-19203):",
    );
  });

  test("moves Liam's own pull request off neither reviewer, since Julian is its only reviewer", async () => {
    const branch = "liam/HAL-5701-work";
    const run = watcher({
      held: task(5701, agents.julian, { branch }),
      branch,
      limits: { [agents.julian]: parked },
    });
    expect(await run.run()).toMatchObject({ rerouted: 0 });
    expect(run.handoffs).toEqual([]);
  });

  test("leaves the review when both are limited, with one note per head and no wake", async () => {
    const run = watcher({ limits: { [agents.liam]: parked, [agents.julian]: atLimit } });
    expect(await run.run()).toMatchObject({ rerouted: 0, bothLimited: 1 });
    expect(await run.run()).toMatchObject({ rerouted: 0, bothLimited: 0 });
    expect(run.handoffs).toEqual([]);
    expect(run.wakes).toEqual([]);
    expect(notes(run, "PR watcher: both reviewers")).toHaveLength(1);
    expect(notes(run, "PR watcher: both reviewers")[0]?.split("\n")[0]).toBe(
      "PR watcher: both reviewers are limited (Liam is parked on a pool wait since 24 Nov 17:40 CET; Julian is at a seat or usage limit since 24 Nov 17:30 CET), so this review stays with Liam:",
    );
  });

  test("moves nothing when the other reviewer's runs can't be read", async () => {
    const run = watcher({ limits: { [agents.liam]: parked, [agents.julian]: "unknown" } });
    expect(await run.run()).toMatchObject({ rerouted: 0, bothLimited: 0 });
    expect(run.handoffs).toEqual([]);
  });

  test("moves nothing for a free reviewer, an approved, draft or red head, or a working run", async () => {
    const cases = [
      watcher({ limits: {} }),
      watcher({ extra: { approvals: [{ by: "Julian", head: "5701aaa" }] } }),
      watcher({ extra: { draft: true } }),
      watcher({ extra: { ciOkOnHead: "failure" } }),
      watcher({ held: task(5701, agents.liam, { branch: mateoBranch, running: true }) }),
      watcher({
        held: task(5701, agents.liam, { branch: mateoBranch, running: true, runStatus: "running" }),
      }),
      watcher({ held: task(5701, agents.liam, { branch: mateoBranch, parked: true }) }),
    ];
    for (const run of cases) {
      expect(await run.run()).toMatchObject({ rerouted: 0, failed: [] });
      expect(run.handoffs).toEqual([]);
    }
  });

  test("moves it over a run that is only queued or parked", async () => {
    for (const runStatus of ["queued", "scheduled_retry"]) {
      const held = task(5701, agents.liam, { branch: mateoBranch, running: true, runStatus });
      const run = watcher({ held });
      expect(await run.run()).toMatchObject({ rerouted: 1 });
    }
  });

  test("the choice: Julian's own pull request stays with a limited Liam", () => {
    expect(rerouteChoice("liam", "julian", true, false)).toEqual({ kind: "stay", why: "author" });
    expect(rerouteChoice("liam", "liam", false, false)).toEqual({ kind: "move", to: "julian" });
    expect(rerouteChoice("julian", "mateo", false, true)).toEqual({
      kind: "stay",
      why: "both limited",
    });
  });
});
