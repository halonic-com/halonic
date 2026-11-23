import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type AgentEntry, workerAgentsPage } from "./page.ts";
import type { WorkerTables } from "./tables.ts";
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
    const page = await workerAgentsPage("acme", agents, tables, now);
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
    const [ravi, kim, leo] = (await workerAgentsPage("acme", agents, tables, now)).agents;
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
  });
});
