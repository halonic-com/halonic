import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { companyRoster } from "./companies.ts";
import { fakeHost, fakeJobContext, mergedGreenOnGitHub } from "./fake-host.test-helper.ts";
import { type JobApi, runWatcher } from "./job.ts";
import { type ScheduledApi, scheduledPerCompany } from "./scheduled.ts";
import { withScopeRule } from "./scoped-host.test-helper.ts";

const now = new Date("2026-11-23T11:30:00Z");
const token = { type: "secret_ref", secretId: "secret-pr-watcher" };

// A job's pass reads the clock itself, and the fixture's merge leaves the
// watcher's 3-day window on 24 Nov 20:48 UTC (HAL-17848): pin the clock.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
});

/** The PR watcher of HAL-4485 (see job.test.ts) on a host that applies the scope rule. */
function setUp(configured: readonly string[] = ["acme"]) {
  const { host, writes } = fakeHost([
    {
      id: "task-4485",
      identifier: "HAL-4485",
      status: "in_progress",
      assigneeAgentId: "agent-priya",
    },
  ]);
  const job = fakeJobContext({
    host,
    configs: { acme: { githubToken: token, dryRun: false } },
    answers: mergedGreenOnGitHub,
  });
  const scoped = withScopeRule(job.ctx, configured);
  const ctx = scoped.ctx as unknown as JobApi & ScheduledApi;
  const roster = companyRoster();
  const watcher = scheduledPerCompany(ctx, roster, "pr-watch", (companyId, at) =>
    runWatcher(ctx, at, async () => [companyId]),
  );
  // An event handler of this plugin, such as a new comment's, still in flight.
  const eventInFlight = () => scoped.deliver("issue.comment.created", "acme");
  return { ...job, ctx, roster, watcher, writes, eventInFlight };
}

verifies("paperclip.pr-watcher-plugin", () => {
  test("the job's pass succeeds while an event handler is in flight", async () => {
    const { roster, watcher, writes, logs, eventInFlight } = setUp();
    await eventInFlight();
    roster.remember("acme");
    await watcher.dispatch();
    expect(logs.filter((log) => log.level === "error")).toEqual([]);
    expect(writes[0]).toEqual({ kind: "update", issueId: "task-4485", patch: { status: "done" } });
  });

  test("a pass straight from the job is refused while an event is in flight (0.3.0's failure)", async () => {
    const { ctx, eventInFlight } = setUp();
    await eventInFlight();
    await expect(runWatcher(ctx, now)).rejects.toThrow(
      'not allowed to perform "companies.list": the worker referenced a missing, expired, or unknown invocation scope',
    );
    // Naming the company alone is not enough: the GitHub requests name none.
    await expect(runWatcher(ctx, now, async () => ["acme"])).rejects.toThrow("couldn't be checked");
  });
});

describe("the company roster", () => {
  test("uses the host's list while nothing else is in flight", async () => {
    const { ctx, roster, writes, watcher } = setUp();
    await watcher.dispatch();
    expect(await roster.ids(ctx)).toEqual(["acme"]);
    expect(writes[0]).toEqual({ kind: "update", issueId: "task-4485", patch: { status: "done" } });
  });

  test("falls back to the companies seen when the host won't list them", async () => {
    const { ctx, roster, logs, eventInFlight } = setUp();
    await eventInFlight();
    expect(await roster.ids(ctx)).toEqual([]);
    roster.remember("acme");
    expect(await roster.ids(ctx)).toEqual(["acme"]);
    expect(logs.map((log) => log.message)).toContain(
      "Jobs: the host didn't list the companies while busy; using the 1 seen so far.",
    );
  });

  test("skips a company the plugin isn't set up for", async () => {
    const { roster, watcher, writes, logs, eventInFlight } = setUp([]);
    await eventInFlight();
    roster.remember("globex");
    await watcher.dispatch();
    expect(writes).toEqual([]);
    expect(logs).toContainEqual({
      level: "info",
      message: "pr-watch: not set up for this company, skipped.",
      meta: { companyId: "globex" },
    });
  });
});
