import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { countMonitors } from "../pr-watcher/monitors.ts";
import type { TaskRow } from "../pr-watcher/paperclip.ts";
import { loadSnapshot } from "../snapshot/store.ts";
import {
  type FakeIssue,
  fakeHost,
  fakeJobContext,
  mergedGreenOnGitHub,
} from "./fake-host.test-helper.ts";
import { runWatcher } from "./job.ts";
import { countingGet } from "./metrics.ts";

const now = new Date("2026-11-22T07:20:00Z");
const token = { type: "secret_ref", secretId: "secret-pr-watcher" };

/** HAL-4485 (Priya's merged pull request), its monitor fired 4 minutes ago and is due again in an hour. */
const priyasTask: FakeIssue = {
  id: "task-4485",
  identifier: "HAL-4485",
  status: "in_progress",
  assigneeAgentId: "agent-priya",
  monitorLastTriggeredAt: new Date("2026-11-22T07:16:00Z"),
  monitorNextCheckAt: new Date("2026-11-22T08:16:00Z"),
};

/** HAL-77, no pull request, its monitor fired 30 minutes ago and is due in 5. */
const otherTask: FakeIssue = {
  id: "task-77",
  identifier: "HAL-77",
  status: "todo",
  assigneeAgentId: "agent-mateo",
  monitorLastTriggeredAt: new Date("2026-11-22T06:50:00Z"),
  monitorNextCheckAt: new Date("2026-11-22T07:25:00Z"),
};

function setUp(metricsFail = false) {
  const { host } = fakeHost([priyasTask, otherTask]);
  return fakeJobContext({
    host,
    configs: { acme: { githubToken: token } },
    answers: mergedGreenOnGitHub,
    metricsFail,
  });
}

/** A task row with only the monitor times set. */
function row(identifier: string, next: string | null, last: string | null): TaskRow {
  return {
    id: identifier,
    identifier,
    assigneeAgentId: null,
    running: false,
    openChildren: false,
    monitorNextCheckAt: next,
    monitorLastTriggeredAt: last,
  };
}

verifies("paperclip.agent-tools-metrics", () => {
  test("saves each pass's counts, GitHub requests and monitors, tagged with the company and dry run", async () => {
    const { ctx, metrics, sent } = setUp();
    await runWatcher(ctx, now);
    const values = Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
    expect(values).toMatchObject({
      "pr_watcher.tasks_with_pr": 1,
      "pr_watcher.done": 1,
      "pr_watcher.woken": 0,
      "pr_watcher.failed": 0,
      "pr_watcher.github_requests": sent.length,
      "monitors.set": 2,
      "monitors.fired": 1,
      "monitors.set_on_pr_tasks": 1,
      "monitors.fired_on_pr_tasks": 1,
    });
    expect(sent.length).toBeGreaterThan(0);
    expect(metrics.every((metric) => metric.value >= 0)).toBe(true);
    expect(new Set(metrics.map((metric) => JSON.stringify(metric.tags)))).toEqual(
      new Set([JSON.stringify({ companyId: "acme", dryRun: "true" })]),
    );
  });

  test("still runs the pass when the metrics don't save, and logs it", async () => {
    const { ctx, logs } = setUp(true);
    await expect(runWatcher(ctx, now)).resolves.toBeUndefined();
    expect(logs.map((log) => log.message)).toContainEqual(
      "PR watcher: couldn't save its metrics: metrics store is down",
    );
  });
});

verifies("paperclip.github-call-counts", () => {
  test("a pass logs its GitHub calls by step and keeps the snapshot's count with the snapshot", async () => {
    const { ctx, logs, metrics, sent } = setUp();
    await runWatcher(ctx, now);
    const line = logs.map((log) => log.message).find((message) => message.includes("GitHub calls"));
    const counts = /(\d+) GitHub calls \(snapshot (\d+), watcher (\d+), thin-spec (\d+)\)/
      .exec(line ?? "")
      ?.slice(1)
      .map(Number);
    expect(counts).toHaveLength(4);
    const [total, snapshot, watcher, thinSpec] = counts ?? [];
    expect(total).toBe(sent.length);
    expect((snapshot ?? 0) + (watcher ?? 0) + (thinSpec ?? 0)).toBe(sent.length);
    expect(snapshot).toBeGreaterThan(0);
    expect((await loadSnapshot(ctx, "acme"))?.githubCalls).toBe(snapshot);
    const saved = metrics.find((metric) => metric.name === "pr_watcher.github_requests_snapshot");
    expect(saved?.value).toBe(snapshot);
  });
});

verifies("paperclip.pr-watcher-monitor-postpone", () => {
  test("saves the monitors it moved and the moves Paperclip refused", async () => {
    const { ctx, metrics } = setUp();
    await runWatcher(ctx, now);
    const names = metrics.map((metric) => metric.name);
    expect(names).toContain("monitors.postponed");
    expect(names).toContain("monitors.postpone_refused");
  });
});

describe("monitor counts", () => {
  test("counts a monitor as fired only within the last pass, and as set only when it's due later", () => {
    const tasks = [
      row("HAL-1", "2026-11-22T07:30:00Z", "2026-11-22T07:10:01Z"),
      row("HAL-2", "2026-11-22T07:19:00Z", "2026-11-22T07:10:00Z"),
      row("HAL-3", null, "2026-11-22T07:21:00Z"),
      row("HAL-4", null, null),
    ];
    expect(countMonitors(tasks, new Set(["HAL-2", "HAL-4"]), now)).toEqual({
      set: 1,
      fired: 1,
      setOnPrTasks: 0,
      firedOnPrTasks: 0,
    });
  });

  test("counts failed GitHub requests too", async () => {
    const counted = countingGet(() => Promise.reject(new Error("GitHub is down")));
    await expect(counted.get("/rate_limit")).rejects.toThrow("GitHub is down");
    expect(counted.requests()).toBe(1);
  });
});
