import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type Snapshot, type SnapshotPull, snapshotVersion } from "../snapshot/shape.ts";
import { type GitHubRoutesApi, handleGitHubPull, handleGitHubSummary } from "./github-routes.ts";
import { manifest } from "./manifest.ts";

const repo = "acme-co/anvil";
const long = "x".repeat(300);

function pull(number: number, author: string, branch: string, extra: object = {}): SnapshotPull {
  return {
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    title: `Pull ${number}`,
    state: "open",
    branch,
    headRepo: repo,
    base: "main",
    head: `head${number}`,
    updatedAt: "2026-11-24T10:00:00Z",
    mergedAt: null,
    mergeCommit: null,
    open: {
      draft: false,
      mergeable: "yes",
      ciOk: "failure",
      draftCiOk: "missing",
      inQueue: false,
      labels: [{ name: "fast-track", addedBy: "acme-boss", addedAt: "2026-11-24T09:00:00Z" }],
      finding: null,
      approvals: [{ by: "Julian", head: `head${number}` }],
      author,
      failingChecks: [long, "lint"],
      reviewCounts: { blocker: 0, major: 2, minor: 0, nit: 1 },
      ...extra,
    },
  };
}

const snapshot: Snapshot = {
  version: snapshotVersion,
  takenAt: "2026-11-24T10:05:00Z",
  closedWindowDays: 3,
  repos: [
    {
      repo,
      defaultBranch: "main",
      queue: [],
      pulls: [
        pull(5641, "acme-boss", "boss/try-a-thing"),
        pull(5642, "halonic-dev", "mateo/HAL-17600-walk-back"),
        pull(5643, "stranger-danger", "patch-1"),
      ],
    },
  ],
};

/** A plugin context that keeps state in a map and remembers every read. */
function context(): { ctx: GitHubRoutesApi; reads: string[] } {
  const reads: string[] = [];
  const state: Record<string, unknown> = {
    snapshot,
    "dequeue-reasons": {
      version: 1,
      reasons: [{ repo, number: 5641, at: "2026-11-24T09:30:00Z", reason: long }],
    },
  };
  const ctx: GitHubRoutesApi = {
    state: {
      get: async (key) => {
        reads.push(key.stateKey);
        return state[key.stateKey] ?? null;
      },
    },
    config: {
      get: async () => {
        reads.push("config");
        return { fastTrackLabelAdder: "acme-boss" };
      },
    },
    logger: { error: () => {} },
  };
  return { ctx, reads };
}

function request(actor: object, params: Record<string, string> = {}): PluginApiRequestInput {
  return {
    routeKey: "github-pull",
    method: "GET",
    path: "/github/pr",
    params,
    query: { companyId: "acme" },
    body: undefined,
    headers: {},
    companyId: "acme",
    actor,
  } as unknown as PluginApiRequestInput;
}

const board = { actorType: "user", actorId: "user-1", userId: "user-1" };
const agent = { actorType: "agent", actorId: "a1", agentId: "a1", runId: "run-1" };

const fetchCalls = vi.fn(() => {
  throw new Error("the GitHub routes must not send a request");
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchCalls);
});

afterEach(() => {
  expect(fetchCalls).not.toHaveBeenCalled();
  fetchCalls.mockClear();
  vi.unstubAllGlobals();
});

verifies("paperclip.github-routes", () => {
  test("the manifest declares both routes GET and board-only", () => {
    const routes = manifest.apiRoutes?.filter((route) => route.routeKey.startsWith("github-"));
    expect(routes?.map((route) => [route.method, route.path, route.auth])).toEqual([
      ["GET", "/github/summary", "board"],
      ["GET", "/github/pr/:number", "board"],
    ]);
  });

  test("an agent's key gets 403 from both routes and reads nothing", async () => {
    const { ctx, reads } = context();
    expect((await handleGitHubSummary(request(agent), ctx)).status).toBe(403);
    expect((await handleGitHubPull(request(agent, { number: "5641" }), ctx)).status).toBe(403);
    expect(reads).toEqual([]);
  });

  test("the summary names the board, agents and outsiders without logins or review text", async () => {
    const { ctx } = context();
    const response = await handleGitHubSummary(request(board), ctx);
    expect(response.status).toBe(200);
    const body = response.body as { takenAt: string; repos: { open: unknown[] }[] };
    expect(body.takenAt).toBe("2026-11-24T10:05:00Z");
    expect(body.repos[0]?.open).toMatchObject([
      {
        number: 5641,
        author: { kind: "person", name: "the board" },
        fastTrack: true,
        approvedBy: ["Julian"],
        reviewCounts: { major: 2, nit: 1 },
      },
      { number: 5642, author: { kind: "agent", name: "mateo" }, work: "HAL-17600" },
      { number: 5643, author: { kind: "person", name: "outside contributor" }, work: null },
    ]);
    const text = JSON.stringify(body);
    for (const leak of ["acme-boss", "halonic-dev", "stranger-danger", "body", "url"]) {
      expect(text).not.toContain(leak);
    }
  });

  test("cuts the failing check's name and the dequeue reason to 120 characters", async () => {
    const { ctx } = context();
    const response = await handleGitHubPull(request(board, { number: "5641" }), ctx);
    expect(response.status).toBe(200);
    const body = response.body as {
      takenAt: string;
      pull: { failedCheck: string; dequeued: { reason: string } };
      failingChecks: string[];
    };
    expect(body.takenAt).toBe("2026-11-24T10:05:00Z");
    expect(body.pull.failedCheck).toHaveLength(120);
    expect(body.pull.dequeued.reason).toHaveLength(120);
    expect(body.failingChecks.map((name) => name.length)).toEqual([120, 4]);
  });

  test("a number that isn't a positive integer, or isn't in the snapshot, gets 404", async () => {
    for (const number of ["1%2F..", "1/..", "0", "-1", "1e3", "", "1234567890"]) {
      const { ctx, reads } = context();
      expect((await handleGitHubPull(request(board, { number }), ctx)).status).toBe(404);
      expect(reads).toEqual([]);
    }
    const { ctx } = context();
    expect((await handleGitHubPull(request(board, { number: "99999999" }), ctx)).status).toBe(404);
  });

  test("before the first snapshot the summary is empty, and a stored snapshot of another shape is a 503", async () => {
    const { ctx } = context();
    const empty = { ...ctx, state: { get: async () => null } };
    expect((await handleGitHubSummary(request(board), empty)).body).toEqual({
      takenAt: null,
      repos: [],
      mergeSpeed: null,
    });
    const other = { ...ctx, state: { get: async () => ({ version: 99 }) } };
    expect((await handleGitHubSummary(request(board), other)).status).toBe(503);
  });
});
