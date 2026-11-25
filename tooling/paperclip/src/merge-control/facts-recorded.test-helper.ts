import { type Fetch, gitHubReader } from "../pr-watcher/github.ts";
import { gitHubQueryReader } from "../snapshot/graphql.ts";
import {
  capacityAnswers,
  graphqlAnswer,
  merger,
  prometheusUrl,
  repo,
  restAnswers,
  restKey,
  statusUrl,
} from "./facts.test-helper.ts";
import { type FactsCaches, factsCaches } from "./facts.ts";
import type { RestRun } from "./facts-runs.ts";

/** One request the fake GitHub or a capacity address received. */
export interface Sent {
  readonly method: string;
  readonly url: string;
  readonly body?: string;
}

/**
 * A reader on recorded answers, through the real GitHub readers, recording
 * every request. `graphql` answers a query first; when it gives undefined,
 * the recorded answer does.
 */
export function recorded(
  options: {
    capacity?: Record<string, unknown>;
    groups?: RestRun[];
    caches?: FactsCaches;
    rest?: Record<string, unknown>;
    graphql?: (query: string, variables: Record<string, unknown>) => unknown;
  } = {},
) {
  const sent: Sent[] = [];
  const rest = { ...restAnswers(options.groups), ...options.rest };
  const fetch: Fetch = async (url, init) => {
    sent.push({
      method: init.method,
      url,
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    const parsed = new URL(url);
    if (parsed.pathname === "/graphql") {
      const { query, variables } = JSON.parse(init.body ?? "{}") as {
        query: string;
        variables: Record<string, unknown>;
      };
      const data = options.graphql?.(query, variables) ?? graphqlAnswer(query);
      return { ok: true, status: 200, json: async () => ({ data }) };
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
