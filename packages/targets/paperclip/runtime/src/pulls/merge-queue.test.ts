import type { Tool } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost, githubToken } from "../fake-host.test-helper.ts";
import type { GitHubGet, GitHubQuery } from "../github.ts";
import { type ActionCall, runtimeHandlers } from "../handlers.ts";
import { registerWorkspaceTools } from "../register.ts";

/** The invented `acme` repositories and the time the tests run at. */
const repo = "acme/website";
const other = "acme/private-tools";
const now = new Date("2026-11-24T15:05:00Z");

/** `queue_state` reading the listed repositories. */
function queueStateTool(repositories: string[] = [repo]): Tool {
  return acmeTool("queue_state", {
    action: { run: "github.merge-queue", with: { repositories } },
  } as Partial<Tool>);
}

/** A check run as the commit's rollup lists it. */
function run(name: string, status: string, conclusion: string | null, startedAt: string) {
  return { name, status, conclusion, startedAt };
}

/** A commit's rollup holding `runs`; `more` when GitHub has another page. */
function rollup(runs: ReturnType<typeof run>[], more = false) {
  return { contexts: { pageInfo: { hasNextPage: more }, nodes: runs } };
}

/** A pull request's branch in `acme/website` itself, naming its task. */
function branch(name: string, headRepo = repo) {
  return { headRefName: name, headRepository: { nameWithOwner: headRepo } };
}

/**
 * The queue at 15:05: #41 and #42 share one group commit, whose `ci-ok` is
 * green and which has 2 jobs queued since 14:58 and 14:59; #43 waits for its
 * group; #44 comes from a fork with a branch named like ours.
 */
const sharedGroup = {
  oid: "a".repeat(40),
  statusCheckRollup: rollup([
    run("ci-ok", "COMPLETED", "SUCCESS", "2026-11-24T14:50:00Z"),
    run("test (linux)", "QUEUED", null, "2026-11-24T14:59:00Z"),
    run("test (windows)", "QUEUED", null, "2026-11-24T14:58:00Z"),
  ]),
};

function entry(position: number, number: number, head: typeof sharedGroup | null, from = branch) {
  return {
    position,
    state: head === null ? "QUEUED" : "AWAITING_CHECKS",
    enqueuedAt: "2026-11-24T14:45:00Z",
    estimatedTimeToMerge: head === null ? null : 600,
    enqueuer: { login: "acme-queue" },
    pullRequest: {
      number,
      url: `https://github.com/${repo}/pull/${number}`,
      ...from(`priya/ACME-${number}-x`),
    },
    headCommit: head,
  };
}

const busyQueue = {
  mergeQueue: {
    entries: {
      nodes: [
        entry(2, 42, sharedGroup),
        entry(1, 41, sharedGroup),
        entry(3, 43, null),
        entry(4, 44, null, (name) => branch(name, "stranger/website")),
      ],
    },
  },
  pullRequests: {
    nodes: [
      {
        number: 50,
        url: `https://github.com/${repo}/pull/50`,
        isDraft: false,
        isInMergeQueue: false,
        ...branch("mateo/ACME-50-fix"),
        timelineItems: {
          nodes: [
            {
              createdAt: "2026-11-24T14:00:00Z",
              label: { name: "fast-track" },
              actor: { login: "acme-lead" },
            },
          ],
        },
        commits: {
          nodes: [{ commit: { oid: "b".repeat(40), statusCheckRollup: rollup([], true) } }],
        },
      },
      {
        number: 51,
        url: `https://github.com/${repo}/pull/51`,
        isDraft: true,
        isInMergeQueue: false,
        ...branch("mateo/ACME-51-docs"),
        // GitHub no longer returns the label event.
        timelineItems: { nodes: [] },
        commits: { nodes: [{ commit: { oid: "c".repeat(40), statusCheckRollup: null } }] },
      },
    ],
  },
};

const emptyQueue = { mergeQueue: { entries: { nodes: [] } }, pullRequests: { nodes: [] } };

/** A GraphQL reader answering each repository from `answers`; any other is unknown, as GitHub says. */
function fakeQuery(answers: Record<string, unknown>) {
  const asked: string[] = [];
  const query: GitHubQuery = async (_document, variables) => {
    const name = `${variables["owner"]}/${variables["name"]}`;
    asked.push(name);
    const repository = answers[name];
    if (repository === undefined) {
      throw new Error(
        `GitHub: the GraphQL query answered 200: Could not resolve to a Repository with the name '${name}'.`,
      );
    }
    return { repository };
  };
  return { query, asked };
}

/** A REST reader for the `ci-ok` a long rollup leaves out. */
const restGet: GitHubGet = async (path) => {
  if (path.startsWith(`/repos/${repo}/commits/${"b".repeat(40)}/check-runs`)) {
    return {
      check_runs: [{ status: "in_progress", conclusion: null, started_at: "2026-11-24T15:00:00Z" }],
    };
  }
  throw new Error(`GitHub: GET ${path.split("?")[0]} answered 404.`);
};

/** Runs `github.merge-queue` through the runtime's handlers, as Mateo would call it. */
function runQueue(tool: Tool, query: GitHubQuery) {
  const handler = runtimeHandlers["github.merge-queue"];
  if (handler === undefined) throw new Error("no handler for github.merge-queue");
  return handler.run({
    tool,
    params: {},
    templates: [],
    caller: { agentId: "agent-mateo", urlKey: "mateo", name: "Mateo" },
    now,
    companyId: "acme",
    paperclip: {} as ActionCall["paperclip"],
    github: async () => restGet,
    githubQuery: async () => query,
  });
}

/** A plugin host serving `queue_state` with the runtime's handlers, GitHub answering `graphql`. */
function queueHost(graphql: unknown) {
  const host = fakeHost({ githubToken }, { "/graphql": graphql });
  registerWorkspaceTools(host.ctx, {
    declarations: [
      {
        name: "queue_state",
        displayName: "queue_state",
        description: "Acme's queue_state.",
        parametersSchema: { type: "object", properties: {} },
      },
    ],
    builtIn: acmeSnapshot({ tools: [queueStateTool()] }),
    handlers: runtimeHandlers,
    now: () => now,
  });
  return host;
}

verifies("runtime.github-merge-queue", () => {
  describe("github.merge-queue", () => {
    test("answers an empty queue through a plugin host, with one GraphQL request", async () => {
      const host = queueHost({ data: { repository: emptyQueue } });
      const result = await host.call("queue_state", {});
      expect(result.content?.split("\n")).toEqual([
        "Merge queue read from GitHub at 24 Nov 16:05 CET.",
        "acme/website: 0 in the queue; no merge-group job waits for a runner.",
        "no open pull request carries fast-track",
      ]);
      expect(result.data).toEqual({
        takenAt: "2026-11-24T15:05:00.000Z",
        ageMinutes: 0,
        stale: false,
        repos: [
          { repo, entries: [], runnerWait: { jobs: 0, longestMinutes: null }, fastTrack: [] },
        ],
        unread: [],
      });
      expect(host.sent).toEqual(["https://api.github.com/graphql"]);
    });

    test("lists the entries in queue order, each group's ci-ok and waiting jobs counted once", async () => {
      const result = await runQueue(queueStateTool(), fakeQuery({ [repo]: busyQueue }).query);
      const [state] = (result.data as { repos: unknown[] }).repos;
      expect(state).toEqual({
        repo,
        entries: [
          {
            number: 41,
            url: `https://github.com/${repo}/pull/41`,
            task: "ACME-41",
            position: 1,
            state: "AWAITING_CHECKS",
            enqueuedBy: "acme-queue",
            minutesInQueue: 20,
            groupCiOk: "success",
            estimatedMinutes: 10,
          },
          {
            number: 42,
            url: `https://github.com/${repo}/pull/42`,
            task: "ACME-42",
            position: 2,
            state: "AWAITING_CHECKS",
            enqueuedBy: "acme-queue",
            minutesInQueue: 20,
            groupCiOk: "success",
            estimatedMinutes: 10,
          },
          {
            number: 43,
            url: `https://github.com/${repo}/pull/43`,
            task: "ACME-43",
            position: 3,
            state: "QUEUED",
            enqueuedBy: "acme-queue",
            minutesInQueue: 20,
            groupCiOk: "not formed",
            estimatedMinutes: null,
          },
          {
            number: 44,
            url: `https://github.com/${repo}/pull/44`,
            task: undefined,
            position: 4,
            state: "QUEUED",
            enqueuedBy: "acme-queue",
            minutesInQueue: 20,
            groupCiOk: "not formed",
            estimatedMinutes: null,
          },
        ],
        runnerWait: { jobs: 2, longestMinutes: 7 },
        fastTrack: [
          {
            number: 50,
            url: `https://github.com/${repo}/pull/50`,
            task: "ACME-50",
            addedBy: "acme-lead",
            addedAt: "2026-11-24T14:00:00Z",
            draft: false,
            ciOk: "pending",
            inQueue: false,
          },
          {
            number: 51,
            url: `https://github.com/${repo}/pull/51`,
            task: "ACME-51",
            addedBy: null,
            addedAt: null,
            draft: true,
            ciOk: "missing",
            inQueue: false,
          },
        ],
      });
      expect(result.content?.split("\n")).toEqual([
        "Merge queue read from GitHub at 24 Nov 16:05 CET.",
        "acme/website: 4 in the queue; 2 merge-group jobs wait for a runner, the longest 7 min.",
        "1. #41 (ACME-41): AWAITING_CHECKS, group ci-ok success; queued 20 min ago by acme-queue, GitHub estimates 10 min",
        "2. #42 (ACME-42): AWAITING_CHECKS, group ci-ok success; queued 20 min ago by acme-queue, GitHub estimates 10 min",
        "3. #43 (ACME-43): QUEUED, group ci-ok not formed; queued 20 min ago by acme-queue",
        "4. #44 (no task): QUEUED, group ci-ok not formed; queued 20 min ago by acme-queue",
        "fast-track #50 (ACME-50): added by acme-lead at 24 Nov 15:00 CET; ready, ci-ok pending, not queued",
        "fast-track #51 (ACME-51): added by unknown (GitHub doesn't say; never counts as allowed); draft, ci-ok missing, not queued",
      ]);
    });

    test("answers a repository without a merge queue as an empty queue", async () => {
      const github = fakeQuery({ [repo]: { ...emptyQueue, mergeQueue: null } });
      const result = await runQueue(queueStateTool(), github.query);
      expect(result.content?.split("\n")[1]).toBe(
        "acme/website: 0 in the queue; no merge-group job waits for a runner.",
      );
    });

    test("names a repository after the first that the token can't reach instead of failing", async () => {
      const github = fakeQuery({ [repo]: emptyQueue });
      const result = await runQueue(queueStateTool([repo, other]), github.query);
      expect(github.asked).toEqual([repo, other]);
      expect((result.data as { unread: string[] }).unread).toEqual([other]);
      expect(result.content?.split("\n").at(-1)).toBe(
        "Not read: acme/private-tools, the token doesn't reach it.",
      );
    });

    test("answers a GitHub error as the tool's error, without data", async () => {
      const host = queueHost({ errors: [{ message: "API rate limit exceeded" }] });
      expect(await host.call("queue_state", {})).toEqual({
        error: "queue_state: GitHub: the GraphQL query answered 200: API rate limit exceeded.",
      });
    });

    test("fails when the first repository can't be read", async () => {
      const result = runQueue(queueStateTool([other]), fakeQuery({}).query);
      await expect(result).rejects.toThrow("GitHub: acme/private-tools answered 404.");
    });
  });
});
