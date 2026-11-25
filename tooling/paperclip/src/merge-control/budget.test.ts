import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type Fetch, gitHubReader } from "../pr-watcher/github.ts";
import { gitHubQueryReader } from "../snapshot/graphql.ts";
import { defaultBudget, passBudget } from "./budget.ts";
import {
  capacityAnswers,
  graphqlAnswer,
  merger,
  prometheusUrl,
  pullNode,
  repo,
  restAnswers,
  restKey,
  statusUrl,
} from "./facts.test-helper.ts";
import { type FactsCaches, factsCaches, readMergeFacts } from "./facts.ts";
import { factsPageSize } from "./facts-query.ts";
import { headOf, now } from "./merge-control.test-helper.ts";

/** 30 open pull requests, all green and approved, answered a page at a time. */
const thirty = Array.from({ length: 30 }, (_, index) => pullNode(200 + index));

function pullsPage(after: string | null) {
  const start = after === null ? 0 : Number(after);
  const end = start + factsPageSize;
  const base = graphqlAnswer("MergeFactsPulls") as { repository: Record<string, unknown> };
  return {
    ...base,
    repository: {
      ...base.repository,
      pullRequests: {
        pageInfo: { hasNextPage: end < thirty.length, endCursor: String(end) },
        nodes: thirty.slice(start, end),
      },
    },
  };
}

/** A facts reader over the 30 pull requests, recording what GitHub received. */
function thirtyPulls(caches: FactsCaches = factsCaches()) {
  const sent: { method: string; url: string; document?: string }[] = [];
  const rest = restAnswers();
  const fetch: Fetch = async (url, init) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/graphql") {
      const { query, variables } = JSON.parse(init.body ?? "{}") as {
        query: string;
        variables: { after?: string | null };
      };
      sent.push({ method: "POST", url, document: query });
      const data = query.includes("MergeFactsPulls")
        ? pullsPage(variables.after ?? null)
        : graphqlAnswer(query);
      return { ok: true, status: 200, json: async () => ({ data }) };
    }
    sent.push({ method: "GET", url });
    const body = rest[restKey(parsed)];
    return body === undefined
      ? { ok: false, status: 404, json: async () => ({ message: "Not Found" }) }
      : { ok: true, status: 200, json: async () => body };
  };
  const lines: string[] = [];
  const capacity = capacityAnswers();
  const deps = {
    query: gitHubQueryReader({ fetch, token: "placeholder-read-token" }),
    get: gitHubReader({ fetch, token: "placeholder-read-token" }),
    plainGet: async (url: string) => capacity[url.split("?")[0] ?? ""],
    tasks: async () => [],
    settings: {
      repo,
      mergerLogin: merger,
      capacity: { statusUrl, prometheusUrl, queueLabel: "large" },
    },
    caches,
    log: (line: string) => lines.push(line),
  };
  return { deps, sent, lines };
}

verifies("paperclip.merge-control-api-budget", () => {
  test("a pass over 30 pull requests reads them in one snapshot, with no read per pull request", async () => {
    const { deps, sent } = thirtyPulls();
    const { snapshot } = await readMergeFacts(deps, now);
    expect(snapshot.open?.map((pull) => pull.number)).toEqual(thirty.map((pull) => pull.number));
    const pages = sent.filter((request) => request.document?.includes("MergeFactsPulls"));
    expect(pages).toHaveLength(thirty.length / factsPageSize);
    const perPull = sent.filter((request) =>
      thirty.some(
        (pull) =>
          request.url.includes(`/pulls/${pull.number}`) ||
          request.url.includes(`/issues/${pull.number}/`) ||
          request.url.includes(headOf(pull.number)),
      ),
    );
    expect(perPull).toEqual([]);
  });

  test("a second read of the same GET within 90 s comes from the cache and isn't counted", async () => {
    const caches = factsCaches();
    const first = thirtyPulls(caches);
    await readMergeFacts(first.deps, now);
    const firstGets = first.sent.filter((request) => request.method === "GET");
    expect(firstGets.length).toBeGreaterThan(0);

    const second = thirtyPulls(caches);
    await readMergeFacts(second.deps, new Date(now.getTime() + 60_000));
    expect(second.sent.filter((request) => request.method === "GET")).toEqual([]);
    expect(second.lines.at(-1)).toMatch(/^GitHub requests this pass: 0 REST GETs, \d+ GraphQL/);

    const third = thirtyPulls(caches);
    await readMergeFacts(third.deps, new Date(now.getTime() + 91_000));
    // Past 90 s the lists are asked again; a finished run's jobs stay in the reader's own caches.
    expect(third.sent.filter((request) => request.method === "GET").length).toBeGreaterThan(0);
  });

  test("lean, it skips the Merger's writes and the red fast-track run's log", async () => {
    const { deps } = thirtyPulls();
    const { snapshot, observed } = await readMergeFacts(deps, now, { lean: true });
    expect(observed).toEqual([]);
    expect(snapshot.pulls.every((pull) => pull.ciOkRun === null)).toBe(true);
  });
});

verifies("paperclip.merge-control-api-budget", () => {
  const plenty = { calls: 40, remaining: 14_000, resetAt: "2026-11-24T12:41:00Z" };

  test("the summary names each token's calls this pass, what is left and when it resets", () => {
    const result = passBudget(
      undefined,
      { read: plenty, write: { calls: 3, remaining: null, resetAt: null } },
      defaultBudget,
      now,
    );
    expect(result.degraded).toBe(false);
    expect(result.summary).toBe(
      "GitHub budget: reads 40 this pass, 11960 of 12000/h left, resets 12:41 UTC; writes 3 this pass, 3497 of 3500/h left, resets 13:00 UTC",
    );
    expect(result.stored.skipUntil).toBeNull();
  });

  test("with the remaining read budget under its threshold the pass degrades and waits, without throwing", () => {
    const low = { calls: 10, remaining: 600, resetAt: "2026-11-24T12:41:00Z" };
    const result = passBudget(undefined, { read: low, write: plenty }, defaultBudget, now);
    expect(result.degraded).toBe(true);
    expect(result.summary).toContain("reads 10 this pass, 600 of 12000/h left");
    expect(result.summary).toContain("degraded (reads low), next pass after 12:05 UTC");
    expect(result.stored.skipUntil).toBe("2026-11-24T12:05:00.000Z");
  });

  test("each token has its own budget, and the hour's count starts again in a new hour", () => {
    const busy = { calls: 3_200, remaining: null, resetAt: null };
    const write = passBudget(undefined, { read: plenty, write: busy }, defaultBudget, now);
    expect(write.degraded).toBe(true);
    expect(write.summary).toContain("writes 3200 this pass, 300 of 3500/h left");
    expect(write.summary).toContain("degraded (writes low)");

    const nextHour = new Date(now.getTime() + 60 * 60_000);
    const quiet = { calls: 1, remaining: null, resetAt: null };
    const later = passBudget(write.stored, { read: quiet, write: quiet }, defaultBudget, nextHour);
    expect(later.degraded).toBe(false);
    expect(later.stored.write.calls).toBe(1);
  });
});
