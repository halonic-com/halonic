import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type CheckPull, type CheckTask, ruleChecks } from "./rule-checks.ts";

// Made-up agents, tasks and pull requests only.
const now = new Date("2026-11-23T14:20:00.000Z");
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

verifies("paperclip.worker-agents-rule-checks", () => {
  test("a task with nothing set to wake is a Problem; a run, a monitor or a board card makes it valid", () => {
    const { taskState } = ruleChecks(agents, tasks, pulls, now)["ravi"] ?? {};
    expect(taskState).toEqual({
      status: "problem",
      findings: [
        {
          link: { kind: "task", identifier: "HAL-10" },
          reason: "In progress, nothing set to wake",
        },
        {
          link: { kind: "task", identifier: "HAL-12" },
          reason: "Blocked, nothing open in blocked by",
        },
      ],
    });
  });

  test("new work after a red PR last changed is a Check at most, and the PR's own task doesn't count", () => {
    const { newWorkOnRedPr } = ruleChecks(agents, tasks, pulls, now)["ravi"] ?? {};
    expect(newWorkOnRedPr).toEqual({
      status: "check",
      findings: [
        {
          link: { kind: "pr", number: 500, url: "https://example.test/pull/500" },
          reason: "ci-ok failed when HAL-13 started",
        },
      ],
    });
  });

  test("two tasks watching one PR, and a monitor firing every 5 minutes, are Checks", () => {
    const checks = ruleChecks(agents, tasks, pulls, now);
    const shared = {
      link: { kind: "pr", number: 500, url: "https://example.test/pull/500" },
      reason: "Watched by HAL-1 and HAL-14",
    };
    expect(checks["ravi"]?.monitors).toEqual({ status: "check", findings: [shared] });
    expect(checks["kim"]?.monitors).toEqual({
      status: "check",
      findings: [
        shared,
        { link: { kind: "task", identifier: "HAL-14" }, reason: "Monitor fires about every 5 min" },
      ],
    });
  });

  test("workload: nothing to start is a Check, more than 10 in progress a Problem, a paused agent isn't checked", () => {
    const busy = Array.from({ length: 11 }, (_, index) => task(`HAL-${100 + index}`, "kim"));
    const checks = ruleChecks(agents, [...tasks, ...busy], pulls, now);
    expect(checks["ravi"]?.workload.status).toBe("ok");
    expect(checks["kim"]?.workload).toEqual({
      status: "problem",
      findings: [],
      reason: "12 in progress, more than 10",
    });
    expect(checks["mara"]?.workload).toEqual({
      status: "check",
      findings: [],
      reason: "Nothing to start",
    });
    expect(checks["leo"]?.workload).toEqual({
      status: "not_checked",
      findings: [],
      reason: "paused",
    });
  });

  test("a branch starting with the agent's name but no task is a Problem", () => {
    const checks = ruleChecks(agents, tasks, pulls, now);
    expect(checks["ravi"]?.branchNames).toEqual({
      status: "problem",
      findings: [
        {
          link: { kind: "pr", number: 501, url: "https://example.test/pull/501" },
          reason: "Branch doesn't follow <agent>/HAL-<n>-<words>",
        },
      ],
    });
    expect(checks["kim"]?.branchNames.status).toBe("ok");
  });

  test("before the first snapshot the PR checks say Not available yet, never OK", () => {
    const checks = ruleChecks(agents, tasks, undefined, now)["mara"];
    expect(checks?.newWorkOnRedPr.status).toBe("unavailable");
    expect(checks?.branchNames.status).toBe("unavailable");
    expect(checks?.monitors.status).toBe("ok");
  });
});
