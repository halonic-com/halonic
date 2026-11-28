import { JsonRpcCallError, PLUGIN_RPC_ERROR_CODES } from "@paperclipai/plugin-sdk";
import type { HostApi } from "./host.ts";
import type { JobApi } from "./job.ts";

/** An issue as the fake host stores it: only the fields the adapter reads. */
export interface FakeIssue {
  readonly id: string;
  readonly identifier: string;
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly parentId?: string | null;
  readonly activeRun?: { readonly id: string; readonly status?: string } | null;
  readonly monitorNextCheckAt?: Date | null;
  readonly monitorLastTriggeredAt?: Date | null;
  readonly priority?: string;
  readonly blockedTransitionAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly cancelledAt?: Date | null;
}

/** A comment as the fake host stores it. */
export interface FakeComment {
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly createdAt: Date;
  readonly body: string;
}

/** Every write the adapter made, in order. */
export type HostWrite =
  | { readonly kind: "comment"; readonly issueId: string; readonly body: string }
  | { readonly kind: "update"; readonly issueId: string; readonly patch: unknown }
  | { readonly kind: "wake"; readonly issueId: string; readonly options: unknown }
  | { readonly kind: "postpone"; readonly issueId: string; readonly until: string }
  | { readonly kind: "unlink"; readonly issueId: string; readonly blockerIds: readonly string[] };

/** The statuses a task may keep a monitor in. */
const monitorStatuses: ReadonlySet<string> = new Set(["in_progress", "in_review"]);

/**
 * The task after a plugin's update, as Paperclip stores it: a change that leaves the task
 * where it may no longer have a monitor clears it, as the route does (HAL-21217, server#134).
 */
function afterUpdate(issue: FakeIssue, patch: Partial<FakeIssue>): FakeIssue {
  const updated = { ...issue, ...patch };
  if (monitorStatuses.has(updated.status) && updated.assigneeAgentId !== null) {
    return updated;
  }
  return { ...updated, monitorNextCheckAt: null };
}

/** A task in another's "blocked by", as the fake host lists it. */
export interface FakeBlocker {
  readonly id: string;
  readonly identifier: string;
  readonly status: string;
}

/**
 * A plugin host with issues, comments, agents and blockers in memory,
 * recording every write. With `wakeRefusal`, every wake-up is refused with
 * that message.
 */
export function fakeHost(
  issues: FakeIssue[],
  comments: Record<string, FakeComment[]> = {},
  wakeRefusal?: string,
  blockedBy: Record<string, FakeBlocker[]> = {},
) {
  const writes: HostWrite[] = [];
  const fake = {
    issues: {
      get: async (issueId: string) => issues.find((issue) => issue.id === issueId) ?? null,
      list: async (input: { status: string; limit: number; offset: number }) =>
        issues
          .filter((issue) => issue.status === input.status)
          .slice(input.offset, input.offset + input.limit)
          .map((issue) => ({
            parentId: null,
            activeRun: null,
            monitorNextCheckAt: null,
            monitorLastTriggeredAt: null,
            ...issue,
          })),
      listComments: async (issueId: string) => comments[issueId] ?? [],
      listInteractions: async () => [],
      createComment: async (issueId: string, body: string) => {
        writes.push({ kind: "comment", issueId, body });
        return {};
      },
      update: async (issueId: string, patch: unknown) => {
        writes.push({ kind: "update", issueId, patch });
        return {};
      },
      requestWakeup: async (issueId: string, _companyId: string, options: unknown) => {
        if (wakeRefusal !== undefined) {
          throw new Error(wakeRefusal);
        }
        writes.push({ kind: "wake", issueId, options });
        return {};
      },
      relations: {
        get: async (issueId: string) => ({ blockedBy: blockedBy[issueId] ?? [], blocks: [] }),
        removeBlockers: async (issueId: string, blockerIds: string[]) => {
          writes.push({ kind: "unlink", issueId, blockerIds });
          blockedBy[issueId] = (blockedBy[issueId] ?? []).filter(
            (blocker) => !blockerIds.includes(blocker.id),
          );
          return { blockedBy: blockedBy[issueId], blocks: [] };
        },
      },
      monitors: {
        postpone: async (issueId: string, _companyId: string, options: { until: string }) => {
          writes.push({ kind: "postpone", issueId, until: options.until });
          return { postponed: true, nextCheckAt: options.until };
        },
      },
    },
    agents: {
      list: async () => [
        { id: "agent-mateo", urlKey: "mateo" },
        { id: "agent-priya", urlKey: "priya" },
        { id: "agent-liam", urlKey: "liam" },
      ],
    },
  };
  return { host: fake as unknown as HostApi, writes };
}

/**
 * A fake host whose updates are stored on the task, as Paperclip stores them, so a test can read
 * the task back after a change. `fakeHost` itself keeps its tasks as given, for tests that run
 * several passes over the same tasks.
 */
export function fakeHostStoringUpdates(issues: FakeIssue[]) {
  const { host, writes } = fakeHost(issues);
  const update: HostApi["issues"]["update"] = async (issueId, patch, companyId) => {
    const result = await host.issues.update(issueId, patch, companyId);
    const index = issues.findIndex((issue) => issue.id === issueId);
    const issue = issues[index];
    if (issue !== undefined) {
      issues[index] = afterUpdate(issue, patch as Partial<FakeIssue>);
    }
    return result;
  };
  return { host: { ...host, issues: { ...host.issues, update } } as HostApi, writes };
}

/** A metrics client that records every value, or refuses every write when `fail` is set. */
export function fakeMetrics(fail = false) {
  const written: { name: string; value: number; tags: unknown }[] = [];
  const metrics = {
    write: async (name: string, value: number, tags?: unknown) => {
      if (fail) {
        throw new Error("metrics store is down");
      }
      written.push({ name, value, tags });
    },
  };
  return { metrics, written };
}

/** Plugin state in memory, keyed by the whole scope key. */
export function fakeState() {
  const saved = new Map<string, unknown>();
  const state = {
    get: async (key: unknown) => saved.get(JSON.stringify(key)) ?? null,
    set: async (key: unknown, value: unknown) => {
      saved.set(JSON.stringify(key), value);
    },
    delete: async (key: unknown) => {
      saved.delete(JSON.stringify(key));
    },
  };
  return { state, saved };
}

/** A GraphQL answer from `answers["graphql <operation>"]`, wrapped as GitHub wraps it. */
function graphqlAnswer(answers: Record<string, unknown>, body: unknown): unknown {
  const { query } = JSON.parse(String(body)) as { query: string };
  const data = answers[`graphql ${/query (\w+)/.exec(query)?.[1] ?? ""}`];
  return data === undefined ? undefined : { data };
}

const noPulls = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };

/**
 * GitHub's answers for one merged pull request: #4485 on Priya's branch for
 * HAL-4485, merged yesterday, with `ci-ok` green on its merge commit (the
 * recording `merged-green`, as GraphQL answers it).
 */
export const mergedGreenOnGitHub: Record<string, unknown> = {
  "graphql OpenPulls": {
    repository: {
      defaultBranchRef: { name: "main" },
      mergeQueue: { entries: { nodes: [] } },
      pullRequests: noPulls,
    },
  },
  "graphql ClosedPulls": {
    repository: {
      pullRequests: {
        ...noPulls,
        nodes: [
          {
            number: 4485,
            url: "https://github.com/halonic-com/halonic/pull/4485",
            state: "MERGED",
            updatedAt: "2026-11-21T20:48:17Z",
            mergedAt: "2026-11-21T20:48:17Z",
            headRefName: "priya/HAL-4485-month-spend",
            headRefOid: "c0f13fae92570e7a349ca2c9b2d74b057a8808e5",
            baseRefName: "main",
            headRepository: { nameWithOwner: "halonic-com/halonic" },
            mergeCommit: { oid: "ebcd1fab9b028303a9c73e882b58b2811f9c4beb" },
          },
        ],
      },
    },
  },
  "graphql CommitChecks": {
    repository: {
      c0: {
        statusCheckRollup: {
          contexts: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                name: "ci-ok",
                status: "COMPLETED",
                conclusion: "SUCCESS",
                startedAt: "2026-11-21T20:47:54Z",
              },
            ],
          },
        },
      },
    },
  },
};

/** One GitHub request the job sent. */
export interface SentRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | undefined;
  readonly userAgent: string | undefined;
}

/**
 * A plugin context for the job: one company per entry in `configs`, plus the
 * `unconfigured` companies the board saved no settings for, a secret store,
 * and an outbound HTTP that answers GitHub from `answers`.
 */
export function fakeJobContext(options: {
  host: HostApi;
  configs: Record<string, Record<string, unknown>>;
  unconfigured?: readonly string[];
  answers: Record<string, unknown>;
  secret?: () => Promise<string>;
  metricsFail?: boolean;
}) {
  const sent: SentRequest[] = [];
  const logs: { level: string; message: string; meta: unknown }[] = [];
  const resolved: unknown[] = [];
  const signals: unknown[] = [];
  const { metrics, written } = fakeMetrics(options.metricsFail === true);
  const { state, saved } = fakeState();
  const ctx = {
    ...options.host,
    companies: {
      list: async () =>
        [...(options.unconfigured ?? []), ...Object.keys(options.configs)].map((id) => ({ id })),
    },
    config: {
      // Like the host for a scheduled job: a company without saved settings is refused.
      get: async (companyId: string) => {
        const config = options.configs[companyId];
        if (config === undefined) {
          throw new JsonRpcCallError({
            code: PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED,
            message: `Plugin is not allowed to perform "config.get": company context is required`,
          });
        }
        return config;
      },
    },
    secrets: {
      resolve: async (ref: unknown) => {
        resolved.push(ref);
        return options.secret === undefined ? "test-token" : options.secret();
      },
    },
    http: {
      fetch: async (url: string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        sent.push({
          url,
          method: init?.method ?? "GET",
          authorization: headers["authorization"],
          userAgent: headers["user-agent"],
        });
        signals.push(init?.signal);
        const { pathname, search } = new URL(url);
        const body =
          pathname === "/graphql"
            ? graphqlAnswer(options.answers, init?.body)
            : options.answers[pathname + search];
        return body === undefined
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 });
      },
    },
    logger: {
      info: (message: string, meta?: unknown) => logs.push({ level: "info", message, meta }),
      error: (message: string, meta?: unknown) => logs.push({ level: "error", message, meta }),
    },
    metrics,
    state,
  };
  return { ctx: ctx as unknown as JobApi, sent, logs, resolved, signals, metrics: written, saved };
}
