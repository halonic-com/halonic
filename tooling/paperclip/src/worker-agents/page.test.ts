import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type AgentEntry, workerAgentsPage } from "./page.ts";
import type { AgentChecks, RuleCheck, RuleChecksRecord } from "./rule-checks.ts";
import type { WorkerTables } from "./tables.ts";
import {
  allOkText,
  checksBanner,
  checksSummary,
  prDataBanner,
  rowStatusText,
  toggleText,
} from "./ui/check-view.ts";
import { loadErrorCause, moreText, runText, summaryText, taskHref } from "./ui/view.ts";

// Made-up agents and tasks only.
const agents: AgentEntry[] = [
  { id: "bc", name: "Board Checker", urlKey: "board-checker", status: "idle" },
  { id: "pip", name: "Pip", urlKey: "pip", status: "idle" },
  { id: "kim", name: "Kim", urlKey: "kim", status: "idle" },
  { id: "leo", name: "Leo", urlKey: "leo", status: "paused" },
  { id: "ravi", name: "Ravi", urlKey: "ravi", status: "running" },
  { id: "gone", name: "Gone", urlKey: "gone", status: "terminated" },
];

const tables: WorkerTables = {
  tasksInProgress: async () => [
    { agentId: "ravi", identifier: "HAL-2", updatedAt: "2026-11-23T14:10:00.000Z" },
    { agentId: "ravi", identifier: "HAL-1", updatedAt: "2026-11-23T13:00:00.000Z" },
  ],
  lastRuns: async () => [
    { agentId: "ravi", status: "failed", at: "2026-11-23T14:02:00.000Z", task: "HAL-2" },
    { agentId: "bc", status: "succeeded", at: "2026-11-23T14:10:00.000Z", task: undefined },
  ],
  failedRunsSince: async (_companyId, since) => {
    expect(since).toBe("2026-11-22T14:20:00.000Z");
    return [
      { agentId: "ravi", cause: "adapter_error", runs: 1 },
      { agentId: "ravi", cause: "timeout", runs: 3 },
    ];
  },
};

const now = new Date("2026-11-23T14:20:00.000Z");

verifies("paperclip.worker-agents-page", () => {
  test("board agents go to the strip, Pip is left out, and a terminated agent isn't shown", async () => {
    const page = await workerAgentsPage("acme", agents, tables, undefined, now);
    expect(page.boardAgents).toEqual([
      {
        name: "Board Checker",
        paused: false,
        lastRun: { status: "succeeded", at: "2026-11-23T14:10:00.000Z", task: undefined },
      },
    ]);
    expect(page.leftOut).toEqual(["Pip"]);
    expect(page.agents.map((row) => row.name)).toEqual(["Ravi", "Kim", "Leo"]);
    expect(summaryText(page)).toBe("3 agents · Pip left out");
  });

  test("a row has the task that changed last, the newest run and failed runs by cause, most first", async () => {
    const [ravi, kim, leo] = (await workerAgentsPage("acme", agents, tables, undefined, now))
      .agents;
    expect(ravi).toMatchObject({
      current: { task: "HAL-2", more: 1 },
      failed: [
        { cause: "timeout", runs: 3 },
        { cause: "adapter_error", runs: 1 },
      ],
    });
    expect(ravi && moreText(ravi)).toBe("and 1 more in progress");
    expect(runText(ravi?.lastRun)).toBe("Last run 14:02 UTC, Failed");
    expect(kim).toMatchObject({ current: undefined, lastRun: undefined, failed: [] });
    expect(runText(kim?.lastRun)).toBe("No runs yet");
    expect(leo?.paused).toBe(true);
  });

  test("a failed load shows the bridge's code only, and a task links within the company", () => {
    expect(loadErrorCause({ code: "WORKER_UNAVAILABLE" })).toBe("worker_unavailable");
    expect(loadErrorCause({ code: "a sentence from a log" })).toBe("unknown");
    expect(taskHref("HAL", "HAL-2")).toBe("/HAL/issues/HAL-2");
    expect(taskHref(null, "HAL-2")).toBeUndefined();
    expect(taskHref("", "HAL-2")).toBeUndefined();
  });
});

const ok: RuleCheck = { status: "ok", findings: [] };
const allOk: AgentChecks = {
  newWorkOnRedPr: ok,
  taskState: ok,
  monitors: ok,
  workload: ok,
  branchNames: ok,
};
const problem: RuleCheck = {
  status: "problem",
  findings: [
    { link: { kind: "task", identifier: "HAL-1" }, reason: "In progress, nothing set to wake" },
  ],
};

function record(at: string, prDataAt: string | null): RuleChecksRecord {
  return {
    at,
    prDataAt,
    agents: {
      kim: { ...allOk, taskState: problem, workload: { status: "check", findings: [] } },
      ravi: allOk,
      leo: { ...allOk, workload: { status: "not_checked", findings: [], reason: "paused" } },
    },
  };
}

verifies("paperclip.worker-agents-rule-checks", () => {
  test("rows sort worst first, and the all-OK agents share one line", async () => {
    const checks = record("2026-11-23T14:20:00.000Z", "2026-11-23T14:18:00.000Z");
    const page = await workerAgentsPage("acme", agents, tables, checks, now);
    expect(page.agents.map((row) => row.name)).toEqual(["Kim", "Ravi", "Leo"]);
    const [kim, ravi, leo] = page.agents;
    expect(kim && rowStatusText(kim)).toBe("1 problem · 1 to check");
    expect(ravi && rowStatusText(ravi)).toBe("All OK");
    expect(checksSummary(page)).toBe(
      "3 agents · 1 with a problem · 0 to check · 2 all OK · Pip left out",
    );
    expect(
      allOkText(
        page,
        [ravi, leo].filter((row) => row !== undefined),
      ),
    ).toBe("2 more agents, all checks OK: Ravi and 1 paused: Leo");
    expect(toggleText(2, false, false)).toBe("Show the 2 all-OK agents");
    expect(checksBanner(page)).toBeUndefined();
    expect(prDataBanner(page)).toBeUndefined();
  });

  test("out-of-date checks and a missing snapshot are said in words, in the past tense", async () => {
    const late = record("2026-11-23T13:46:00.000Z", null);
    const page = await workerAgentsPage("acme", agents, tables, late, now);
    expect(checksBanner({ ...page, at: "2026-11-23T14:20:00.000Z" })).toBe(
      "These checks are from 13:46 UTC, 34 min ago. board.check has missed 3 passes, so the rows below may be out of date.",
    );
    expect(prDataBanner(page)).toBe(
      "Open PRs and branch names appear once pr.watch writes its first snapshot.",
    );
    expect(allOkText(page, page.agents)).toBe(
      'All 3 worker agents pass the 3 checks that can run now. Open PRs, branch names and "New work on a red PR" aren\'t available yet.',
    );
    const fresh = { ...page, prDataAt: "2026-11-23T13:46:00.000Z" };
    expect(allOkText(fresh, page.agents)).toBe(
      "All 3 worker agents passed every check at 13:46 UTC.",
    );
  });
});
