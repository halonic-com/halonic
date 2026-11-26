import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ReadRefused } from "../merge-control/read-client.ts";
import type { GitHubQuery } from "../snapshot/graphql.ts";
import { fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { type MergerWakeApi, mergerWake } from "./merger-wake.ts";
import { changesBetween, type PullPrint, readPrints } from "./merger-wake-prints.ts";

const print = (patch: Partial<PullPrint> = {}): PullPrint => ({
  head: "a".repeat(40),
  base: "main",
  review: "REVIEW_REQUIRED",
  checks: "PENDING",
  labels: "built-on:paperclip",
  ...patch,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-26T07:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * The Merger wake on a fake host: the Merger's task `task-merger`, held by
 * `agent-merger`, and GitHub answers from `github.prints` or `github.error`.
 * `request` runs the next pass at once, as the job's event would.
 */
function setUp(options: { enabled?: boolean } = {}) {
  const github: { prints: Map<number, PullPrint>; error?: Error; reads: number } = {
    prints: new Map([[6085, print()]]),
    reads: 0,
  };
  const merger = { status: "idle", activeRun: null as { id: string } | null };
  const wakes: { task: string; reason?: string }[] = [];
  const logs: string[] = [];
  const log = (message: string) => logs.push(message);
  const ctx = {
    config: {
      get: async () => ({
        githubToken: { type: "secret_ref", secretId: "secret-1" },
        repos: ["acme/tools"],
        mergerWake: { enabled: options.enabled ?? true, task: "task-merger" },
      }),
    },
    secrets: { resolve: async () => "token" },
    http: { fetch: async () => new Response("{}") },
    issues: {
      get: async (id: string) =>
        id === "task-merger"
          ? { id, assigneeAgentId: "agent-merger", activeRun: merger.activeRun }
          : null,
      requestWakeup: async (task: string, _: string, wake?: { reason?: string }) => {
        wakes.push({ task, ...(wake?.reason === undefined ? {} : { reason: wake.reason }) });
        return {};
      },
    },
    agents: { get: async () => ({ id: "agent-merger", status: merger.status }) },
    logger: { info: log, warn: log, error: log },
  } as unknown as MergerWakeApi;
  const passes: Promise<void>[] = [];
  const waker = mergerWake(ctx, {
    async readPrints() {
      github.reads += 1;
      if (github.error !== undefined) {
        throw github.error;
      }
      return new Map(github.prints);
    },
    request: async (companyId) => {
      passes.push(waker.pass(companyId, new Date()));
    },
  });
  const pass = () => waker.pass("acme", new Date());
  return { github, merger, wakes, logs, waker, pass, settle: () => Promise.all(passes) };
}

verifies("paperclip.merger-wake", () => {
  test("a new head wakes the Merger once on its own task; the first pass only takes the baseline", async () => {
    const { github, wakes, logs, pass } = setUp();
    await pass();
    expect(wakes).toEqual([]);
    github.prints.set(6085, print({ head: "b".repeat(40) }));
    await vi.advanceTimersByTimeAsync(60_000);
    await pass();
    expect(wakes).toEqual([{ task: "task-merger", reason: "merger_pr_change" }]);
    expect(logs).toContain("Merger wake: woke the Merger for #6085 head.");
  });

  test("a pull request whose fields didn't change wakes nobody, however often it is read", async () => {
    const { wakes, pass } = setUp();
    for (let minute = 0; minute < 3; minute += 1) {
      await pass();
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(wakes).toEqual([]);
  });

  test("a second change 10 s after a wake waits for the 45 s mark, then wakes once", async () => {
    const { github, wakes, logs, pass, settle } = setUp();
    await pass();
    github.prints.set(6085, print({ checks: "SUCCESS" }));
    await pass();
    expect(wakes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    github.prints.set(6085, print({ checks: "SUCCESS", labels: "built-on:paperclip,fast-track" }));
    await pass();
    expect(wakes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(35_000);
    await settle();
    expect(wakes).toHaveLength(2);
    expect(logs).toContain("Merger wake: woke the Merger for #6085 labels.");
  });

  test("while a Merger run is in progress the change waits, and the next pass after it wakes", async () => {
    const { github, merger, wakes, pass } = setUp();
    await pass();
    merger.status = "running";
    github.prints.set(6086, print());
    await pass();
    expect(wakes).toEqual([]);
    merger.status = "idle";
    await vi.advanceTimersByTimeAsync(60_000);
    await pass();
    expect(wakes).toHaveLength(1);
  });

  test("a rate limit logs one line and pauses the reads until GitHub's reset time", async () => {
    const { github, logs, pass } = setUp();
    await pass();
    const refused = new ReadRefused(
      "GitHub's limit for the read token is used up until 07:20 UTC.",
    );
    refused.calls = { calls: 1, remaining: 0, resetAt: "2026-11-26T07:20:00Z" };
    github.error = refused;
    await pass();
    for (let minute = 0; minute < 5; minute += 1) {
      await vi.advanceTimersByTimeAsync(60_000);
      await pass();
    }
    expect(github.reads).toBe(2);
    expect(
      logs.filter((line) => line.startsWith("Merger wake: paused until 07:20 UTC")),
    ).toHaveLength(1);
    delete github.error;
    vi.setSystemTime(new Date("2026-11-26T07:20:00Z"));
    await pass();
    expect(github.reads).toBe(3);
  });

  test("switched off, a pass reads nothing and wakes nobody", async () => {
    const { github, wakes, pass } = setUp({ enabled: false });
    await pass();
    github.prints.set(6086, print());
    await pass();
    expect(github.reads).toBe(0);
    expect(wakes).toEqual([]);
  });

  test("a signed approval through the pr-event route wakes the Merger 10 s later", async () => {
    const { wakes, logs, waker, pass, settle } = setUp();
    await pass();
    const line = fakeChiefLine({
      config: { chiefLine: { enabled: true, projectId: "proj-1", prOutcomes: true } },
    });
    const answer = await handleChiefLineRequest(
      lineRequest("chief-line-pr-event", {
        repo: "acme/tools",
        pr: 6085,
        kind: "comment",
        comment: {
          id: 7,
          body: "Liam: approved on head `aaaaaaaaa`",
          author_association: "MEMBER",
          created_at: "2026-11-26T07:00:00Z",
        },
      }),
      line.ctx,
      new Date(),
      { merger: waker.nudge },
    );
    expect(answer.status).toBe(200);
    expect(wakes).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(wakes).toHaveLength(1);
    expect(logs).toContain("Merger wake: woke the Merger for #6085 approval.");
  });

  test("changesBetween names opened, closed and changed pull requests; label order doesn't count", () => {
    const before = new Map([
      [1, print()],
      [2, print({ labels: "a,b" })],
      [3, print()],
    ]);
    const after = new Map([
      [1, print({ review: "APPROVED", base: "release" })],
      [2, print({ labels: "a,b" })],
      [4, print()],
    ]);
    expect(changesBetween(before, after)).toEqual(["#1 base, review", "#4 opened", "#3 closed"]);
  });

  test("readPrints reads every page and sorts the labels", async () => {
    const node = (number: number, labels: string[]) => ({
      number,
      headRefOid: "c".repeat(40),
      baseRefName: "main",
      reviewDecision: null,
      labels: { nodes: labels.map((name) => ({ name })) },
      commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
    });
    const pages = [
      { nodes: [node(1, ["z", "a"])], pageInfo: { hasNextPage: true, endCursor: "c1" } },
      { nodes: [node(2, [])], pageInfo: { hasNextPage: false, endCursor: null } },
    ];
    const afters: unknown[] = [];
    const query: GitHubQuery = async (_, variables) => {
      afters.push(variables["after"]);
      return { repository: { pullRequests: pages[afters.length - 1] } };
    };
    const prints = await readPrints(query, "acme/tools");
    expect(afters).toEqual([null, "c1"]);
    expect(prints.get(1)).toEqual({
      head: "c".repeat(40),
      base: "main",
      review: "none",
      checks: "SUCCESS",
      labels: "a,z",
    });
    expect(prints.get(2)?.labels).toBe("");
  });
});
