import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { snapshotVersion } from "../snapshot/shape.ts";
import { readRuleChecks } from "../worker-agents/rule-checks.ts";
import { checkerTask, type FakeTask, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { pullsNamed } from "./board-check-rule-checks.ts";
import { manifest } from "./manifest.ts";

// Made-up company, agents, tasks and pull requests only.
const now = new Date("2026-11-22T14:20:00Z");
const settings = { boardCheckerTask: checkerTask.id, boardCheckWritesForVersion: manifest.version };

const task = (number: number, fields: Partial<FakeTask>): FakeTask => ({
  id: `task-${number}`,
  identifier: `HAL-${number}`,
  status: "in_progress",
  assigneeAgentId: "agent-mateo",
  updatedAt: new Date("2026-11-22T10:00:00Z"),
  ...fields,
});

const pull = (number: number, branch: string) => ({
  number,
  url: `https://example.test/pull/${number}`,
  state: "open",
  branch,
  headRepo: "acme/app",
  base: "main",
  head: "abc1234",
  updatedAt: "2026-11-22T13:00:00Z",
  mergedAt: null,
  mergeCommit: null,
  open: { draft: false, mergeable: "yes", ciOk: "success", inQueue: false },
});

verifies("paperclip.worker-agents-rule-checks", () => {
  test("a job pass saves every agent's checks for the page and writes nothing for them", async () => {
    const tasks = [
      checkerTask,
      task(1, {}),
      task(2, {
        assigneeAgentId: "agent-priya",
        runs: [{ id: "run-1", agentId: "agent-priya", status: "running" }],
        monitorNextCheckAt: new Date("2026-11-22T14:25:00Z"),
        monitorLastTriggeredAt: new Date("2026-11-22T14:20:00Z"),
        monitorNotes: "Made-up note: check #77 once CI is done.",
      }),
    ];
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => settings });
    fake.state.set("snapshot", {
      version: snapshotVersion,
      takenAt: "2026-11-22T14:18:00Z",
      closedWindowDays: 3,
      repos: [{ repo: "acme/app", defaultBranch: "main", queue: [], pulls: [pull(77, "mateo/x")] }],
    });
    await boardCheck(fake.ctx).run(now);
    const saved = readRuleChecks(fake.state.get("rule-checks"));
    expect(saved).toMatchObject({ at: now.toISOString(), prDataAt: "2026-11-22T14:18:00Z" });
    expect(saved?.agents["agent-mateo"]?.taskState.findings).toEqual([
      { link: { kind: "task", identifier: "HAL-1" }, reason: "In progress, nothing set to wake" },
    ]);
    expect(saved?.agents["agent-mateo"]?.branchNames.status).toBe("problem");
    expect(saved?.agents["agent-priya"]?.monitors.status).toBe("check");
    // The monitor's notes give only a number; their words aren't kept.
    expect(JSON.stringify(saved)).not.toContain("Made-up note");
    expect(fake.sent).toEqual([]);
  });

  test("a monitor's notes give only pull request numbers", () => {
    expect(pullsNamed("Watch #5487 and https://example.test/acme/app/pull/5490, not #7.")).toEqual([
      5487, 5490,
    ]);
    expect(pullsNamed(null)).toEqual([]);
  });
});
