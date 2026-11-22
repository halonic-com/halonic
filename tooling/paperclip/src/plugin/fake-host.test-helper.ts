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
  readonly activeRun?: { readonly id: string } | null;
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
  | { readonly kind: "wake"; readonly issueId: string; readonly options: unknown };

/** A plugin host with issues, comments and agents in memory, recording every write. */
export function fakeHost(issues: FakeIssue[], comments: Record<string, FakeComment[]> = {}) {
  const writes: HostWrite[] = [];
  const fake = {
    issues: {
      list: async (input: { status: string; limit: number; offset: number }) =>
        issues
          .filter((issue) => issue.status === input.status)
          .slice(input.offset, input.offset + input.limit)
          .map((issue) => ({ parentId: null, activeRun: null, ...issue })),
      listComments: async (issueId: string) => comments[issueId] ?? [],
      createComment: async (issueId: string, body: string) => {
        writes.push({ kind: "comment", issueId, body });
        return {};
      },
      update: async (issueId: string, patch: unknown) => {
        writes.push({ kind: "update", issueId, patch });
        return {};
      },
      requestWakeup: async (issueId: string, _companyId: string, options: unknown) => {
        writes.push({ kind: "wake", issueId, options });
        return {};
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

/** One GitHub request the job sent. */
export interface SentRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | undefined;
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
}) {
  const sent: SentRequest[] = [];
  const logs: { level: string; message: string; meta: unknown }[] = [];
  const resolved: unknown[] = [];
  const signals: unknown[] = [];
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
        sent.push({ url, method: init?.method ?? "GET", authorization: headers["authorization"] });
        signals.push(init?.signal);
        const { pathname, search } = new URL(url);
        const body = options.answers[pathname + search];
        return body === undefined
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 });
      },
    },
    logger: {
      info: (message: string, meta?: unknown) => logs.push({ level: "info", message, meta }),
      error: (message: string, meta?: unknown) => logs.push({ level: "error", message, meta }),
    },
  };
  return { ctx: ctx as unknown as JobApi, sent, logs, resolved, signals };
}
