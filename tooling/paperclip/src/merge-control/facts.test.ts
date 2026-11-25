import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type Fetch, gitHubReader } from "../pr-watcher/github.ts";
import { gitHubQueryReader } from "../snapshot/graphql.ts";
import { decide } from "./decide.ts";
import {
  capacityAnswers,
  graphqlAnswer,
  groupRuns,
  merger,
  prometheusUrl,
  repo,
  restAnswers,
  restKey,
  statusUrl,
} from "./facts.test-helper.ts";
import { type FactsCaches, factsCaches, readMergeFacts } from "./facts.ts";
import type { RestRun } from "./facts-runs.ts";
import { headOf, now } from "./merge-control.test-helper.ts";
import { defaultSettings, emptyMergeState } from "./state.ts";

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly body?: string;
}

/** A reader on recorded answers, through the real GitHub readers, recording every request. */
function recorded(
  options: { capacity?: Record<string, unknown>; groups?: RestRun[]; caches?: FactsCaches } = {},
) {
  const sent: Sent[] = [];
  const rest = restAnswers(options.groups);
  const fetch: Fetch = async (url, init) => {
    sent.push({
      method: init.method,
      url,
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    const parsed = new URL(url);
    if (parsed.pathname === "/graphql") {
      const { query } = JSON.parse(init.body ?? "{}") as { query: string };
      return { ok: true, status: 200, json: async () => ({ data: graphqlAnswer(query) }) };
    }
    const body = rest[restKey(parsed)];
    return body === undefined
      ? { ok: false, status: 404, json: async () => ({ message: "Not Found" }) }
      : { ok: true, status: 200, json: async () => body };
  };
  const capacity = options.capacity ?? capacityAnswers();
  const deps = {
    query: gitHubQueryReader({ fetch, token: "ghs_read_only_for_tests" }),
    get: gitHubReader({ fetch, token: "ghs_read_only_for_tests" }),
    plainGet: async (url: string) => {
      sent.push({ method: "GET", url });
      const body = capacity[url.split("?")[0] ?? ""];
      if (body === undefined) {
        throw new Error("answered 500");
      }
      return body;
    },
    tasks: async () => [
      { identifier: "HAL-101", status: "in_review", priority: "high" as const, blockedBy: [] },
    ],
    settings: {
      repo,
      mergerLogin: merger,
      capacity: { statusUrl, prometheusUrl, queueLabel: "large" },
    },
    caches: options.caches ?? factsCaches(),
    log: (line: string) => lines.push(line),
  };
  const lines: string[] = [];
  return { deps, sent, lines };
}

verifies("paperclip.merge-control-facts", () => {
  test("builds a snapshot from recorded GitHub answers, and decide runs on it", async () => {
    const { deps } = recorded();
    const { snapshot } = await readMergeFacts(deps, now);
    expect(snapshot.queue.map((entry) => [entry.number, entry.position])).toEqual([
      [102, 1],
      [106, 2],
    ]);
    // #104 has no built-on label and isn't queued: open, but not one the gate looks at.
    expect(snapshot.pulls.map((pull) => pull.number)).toEqual([101, 102, 103, 106]);
    expect(snapshot.open.map((pull) => pull.number)).toEqual([101, 102, 103, 104, 106]);
    const [ready, queued, fast] = snapshot.pulls;
    expect(ready?.checks.find((check) => check.name === "guard")).toMatchObject({
      workflow: "Guard notes",
      event: "pull_request",
      status: "completed",
      conclusion: "success",
    });
    expect(ready?.ciRun).toMatchObject({ id: 9101, status: "completed" });
    expect(ready?.fileNet).toEqual({ "packages/core/thing-101/src/a.ts": 20 });
    expect(ready?.liveCloud).toEqual([]);
    expect(queued?.forcePushedAt).toHaveLength(1);
    expect(queued?.retargetedAt).toHaveLength(1);
    expect(Object.keys(queued?.manifests ?? {})).toEqual(["packages/acme/package.json"]);
    expect(fast?.fastTrackBy).toBe("halonic-dev");
    expect(fast?.ciOkRun).toMatchObject({ runId: 9103, ciOkJobId: 10301 });
    expect(fast?.ciOkRun?.ciOkLog).toContain("Rerun the failed jobs");
    expect(snapshot.merged).toEqual([{ number: 99, mergedAt: expect.any(String) }]);
    expect(snapshot.mainFiles["packages/core/thing-101/src/a.ts"]).toEqual({
      lines: 100,
      barrel: false,
    });
    expect(snapshot.patchIds[headOf(101)]).toBeNull();
    expect(
      snapshot.groupRuns.find((run) => run.id === 7001)?.failedJobs.map((job) => job.name),
    ).toEqual(["Lint"]);
    expect(snapshot.mergeGroupRuns.map((run) => run.id)).toEqual([7001, 7002, 7003, 7004]);
    expect(snapshot.queuedPullRuns.map((run) => run.id)).toEqual([8001]);
    expect(snapshot.runnerWaitMinutes).toBeCloseTo(0.5);
    expect(snapshot.capacity).toEqual({
      freeQueueSlots: 1,
      waitingByLabel: { fast: 2 },
      cancelledGroupsLastHour: 1,
    });
    expect(snapshot.mainRuns.map((run) => run.id)).toEqual([6001]);
    expect(snapshot.tasks.map((task) => task.identifier)).toEqual(["HAL-101"]);

    const decision = decide(snapshot, emptyMergeState, defaultSettings, now);
    const kinds = decision.actions.map((action) => {
      if ("number" in action) {
        return `${action.kind} #${action.number}`;
      }
      return "runId" in action ? `${action.kind} ${action.runId}` : action.kind;
    });
    expect(kinds).toEqual(
      expect.arrayContaining([
        "enqueue #101",
        "rerun-failed-jobs 9103",
        "cancel-run 7002",
        "cancel-run 8001",
      ]),
    );
  });

  test("an unreadable or stale capacity source gives capacity null, which counts as short", async () => {
    const unreachable = capacityAnswers();
    delete unreachable[statusUrl];
    const broken = recorded({ capacity: unreachable });
    expect((await readMergeFacts(broken.deps, now)).snapshot.capacity).toBeNull();
    expect(broken.lines.join("\n")).toContain("the status file can't be read");

    const stale = capacityAnswers();
    stale[statusUrl] = { ok: true, generated_at: now.getTime() / 1000 - 600, slots: [] };
    expect(
      (await readMergeFacts(recorded({ capacity: stale }).deps, now)).snapshot.capacity,
    ).toBeNull();

    const unset = recorded();
    const settings = {
      ...unset.deps.settings,
      capacity: { ...unset.deps.settings.capacity, prometheusUrl: "" },
    };
    expect((await readMergeFacts({ ...unset.deps, settings }, now)).snapshot.capacity).toBeNull();
  });

  test("every request is a GET or a GraphQL query to api.github.com, or a GET to a capacity address", async () => {
    const { deps, sent } = recorded();
    await readMergeFacts(deps, now);
    expect(sent.length).toBeGreaterThan(10);
    for (const request of sent) {
      const url = new URL(request.url);
      if (url.origin === "https://api.github.com" && request.method === "POST") {
        expect(url.pathname).toBe("/graphql");
        expect(JSON.parse(request.body ?? "{}").query).toMatch(/^\s*query\b/);
        expect(JSON.parse(request.body ?? "{}").query).not.toMatch(/\bmutation\b/);
      } else {
        expect(request.method).toBe("GET");
        expect(["https://api.github.com", new URL(statusUrl).origin, prometheusUrl]).toContain(
          url.origin,
        );
      }
    }
  });
});

verifies("paperclip.merge-control-facts", () => {
  test("reads the Merger's enqueues with a jump, dequeues, comments, reruns and cancels", async () => {
    const caches = factsCaches();
    // The first pass sees run 7004 queued; by the second the Merger has cancelled it.
    await readMergeFacts(recorded({ caches, groups: groupRuns("queued") }).deps, now);
    const second = recorded({ caches });
    const { observed } = await readMergeFacts(second.deps, now);
    expect(observed).toEqual(
      expect.arrayContaining([
        { kind: "enqueue", number: 102, jump: true, at: expect.any(String) },
        { kind: "dequeue", number: 104, at: expect.any(String) },
        { kind: "comment", number: 104, at: expect.any(String) },
        { kind: "rerun", runId: 7003, at: expect.any(String) },
        { kind: "cancel-run", runId: 7004, at: expect.any(String) },
      ]),
    );
    // #106 was queued by someone else.
    expect(observed.some((action) => "number" in action && action.number === 106)).toBe(false);
    // Read once: the failed group's jobs aren't read again on the second pass.
    expect(second.sent.filter((request) => request.url.includes("/runs/7001/jobs"))).toEqual([]);
  });

  test("without the Merger's login nothing is observed", async () => {
    const { deps } = recorded();
    const { observed } = await readMergeFacts(
      { ...deps, settings: { ...deps.settings, mergerLogin: "" } },
      now,
    );
    expect(observed).toEqual([]);
  });
});

verifies("paperclip.merge-control-request-count", () => {
  test("the pass logs as many REST GETs and GraphQL queries as GitHub received, and their cost", async () => {
    const { deps, sent, lines } = recorded();
    await readMergeFacts(deps, now);
    const gitHub = sent.filter((request) => request.url.startsWith("https://api.github.com/"));
    const queries = gitHub.filter((request) => request.method === "POST").length;
    const gets = gitHub.length - queries;
    expect(gets).toBeGreaterThan(5);
    expect(queries).toBeGreaterThan(2);
    // Only the pulls page's recorded answer names its cost: 2 points, 4990 left.
    expect(lines).toContain(
      `GitHub requests this pass: ${gets} REST GETs, ${queries} GraphQL queries (cost 2, 4990 points left)`,
    );
  });

  test("a pass that fails still logs what it sent before the failure", async () => {
    const { deps, lines } = recorded();
    const failing = {
      ...deps,
      get: async () => {
        throw new Error("GitHub: GET /runs answered 502.");
      },
    };
    await expect(readMergeFacts(failing, now)).rejects.toThrow("502");
    expect(lines).toContain(
      "GitHub requests this pass: 1 REST GETs, 1 GraphQL queries (cost 2, 4990 points left)",
    );
  });
});
