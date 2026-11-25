import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type CheckPull, type CheckTask, ruleChecks } from "../worker-agents/rule-checks.ts";
import { decide } from "./rules/rule-checks.ts";

/**
 * Today's rule-check fixtures (`worker-agents/rule-checks.test.ts`), replayed
 * through the `rule-checks` rule (HAL-18319): for each, the rule saves the
 * same checks per agent as `ruleChecks`. Made-up agents, tasks and pull
 * requests only.
 */

const now = new Date("2026-11-23T14:20:00.000Z");
const defaults = { shortestMonitorMinutes: 15, inProgressLimit: 10 };
const agents = [
  { id: "ravi", urlKey: "ravi", status: "running" },
  { id: "kim", urlKey: "kim", status: "idle" },
  { id: "leo", urlKey: "leo", status: "paused" },
  { id: "mara", urlKey: "mara", status: "idle" },
];

function task(identifier: string, agentId: string, fields: Partial<CheckTask> = {}): CheckTask {
  return {
    identifier,
    status: "in_progress",
    assigneeAgentId: agentId,
    running: true,
    monitorNextCheckAt: null,
    monitorLastTriggeredAt: null,
    monitorPulls: [],
    startedAt: "2026-11-23T09:00:00.000Z",
    waitsOnBoard: false,
    ...fields,
  };
}

function pull(number: number, branch: string, fields: Partial<CheckPull> = {}): CheckPull {
  return {
    number,
    url: `https://example.test/pull/${number}`,
    branch,
    updatedAt: "2026-11-23T13:00:00.000Z",
    draft: false,
    ciFailed: false,
    conflicting: false,
    ...fields,
  };
}

const tasks = [
  task("HAL-1", "ravi", { running: false, monitorNextCheckAt: "2026-11-23T18:00:00.000Z" }),
  task("HAL-10", "ravi", { running: false }),
  task("HAL-11", "ravi", { status: "in_review", running: false, waitsOnBoard: true }),
  task("HAL-12", "ravi", {
    status: "blocked",
    running: false,
    blockerAttention: { unresolvedBlockerCount: 0 },
  }),
  task("HAL-13", "ravi", { startedAt: "2026-11-23T14:00:00.000Z" }),
  task("HAL-14", "kim", {
    running: false,
    monitorNextCheckAt: "2026-11-23T14:25:00.000Z",
    monitorLastTriggeredAt: "2026-11-23T14:20:00.000Z",
    monitorPulls: [500],
  }),
  task("HAL-15", "leo", { status: "todo", running: false }),
];

const pulls = [
  pull(500, "ravi/HAL-1-red-one", { ciFailed: true }),
  pull(501, "ravi/fix-thing"),
  pull(502, "kim/HAL-2-fine"),
];

const busy = Array.from({ length: 11 }, (_, index) => task(`HAL-${100 + index}`, "kim"));

/** Each fixture: the agents, tasks and pull requests of one pass. */
const fixtures: [string, typeof agents, CheckTask[], CheckPull[] | undefined][] = [
  ["the open tasks and pull requests", agents, tasks, pulls],
  ["an agent with more than 10 in progress", agents, [...tasks, ...busy], pulls],
  ["no GitHub snapshot yet", agents, tasks, undefined],
  [
    "the left-out agent, one that is gone, and a conflicting PR",
    [
      ...agents,
      { id: "pip", urlKey: "pip", status: "idle" },
      { id: "old", urlKey: "old", status: "terminated" },
    ],
    [...tasks, task("HAL-20", "pip", { running: false })],
    [...pulls, pull(503, "kim/HAL-3-clash", { conflicting: true }), pull(504, "pip/odd")],
  ],
];

function input(
  list: typeof agents,
  open: CheckTask[],
  prs: CheckPull[] | undefined,
  settings = defaults,
) {
  return {
    now: now.toISOString(),
    settings,
    agents: list,
    tasks: open,
    pulls: prs ?? null,
    prDataAt: prs === undefined ? null : "2026-11-23T14:10:00.000Z",
  };
}

verifies("paperclip.signal-rule-checks", () => {
  test.each(fixtures)("gives today's checks for %s", (_, list, open, prs) => {
    const today = ruleChecks(list, open, prs, now);
    expect(decide(JSON.parse(JSON.stringify(input(list, open, prs))))).toEqual([
      {
        kind: "save-rule-checks",
        record: {
          at: now.toISOString(),
          prDataAt: prs === undefined ? null : "2026-11-23T14:10:00.000Z",
          agents: today,
        },
      },
    ]);
  });

  test("between the fixtures, finds a Problem, a Check, not available, not checked and OK", () => {
    const statuses = new Set(
      fixtures.flatMap(([, list, open, prs]) =>
        Object.values(ruleChecks(list, open, prs, now)).flatMap((checks) =>
          Object.values(checks).map((check) => check.status),
        ),
      ),
    );
    expect([...statuses].sort()).toEqual(["check", "not_checked", "ok", "problem", "unavailable"]);
  });

  test("takes a shorter monitor gap and a higher in-progress limit", () => {
    const settings = { shortestMonitorMinutes: 5, inProgressLimit: 12 };
    const [action] = decide(input(agents, [...tasks, ...busy], pulls, settings));
    const kim = action?.record.agents["kim"];
    expect(kim?.monitors.findings.map((finding) => finding.reason)).toEqual([
      "Watched by HAL-1 and HAL-14",
    ]);
    expect(kim?.workload.status).toBe("ok");
  });
});
