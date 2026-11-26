import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  paperclipReviewerLimits,
  type RunsFetch,
  reviewerLimitsOf,
  runRow,
} from "./reviewer-runs.ts";

/** Reading a reviewer's runs from Paperclip's API (HAL-19203). */

const parkedRun = {
  id: "run-1",
  agentId: "agent-liam",
  status: "scheduled_retry",
  scheduledRetryReason: "ai_connection_pool_wait",
  errorCode: null,
  error: null,
  createdAt: "2026-11-26T05:00:32.000Z",
  startedAt: null,
  finishedAt: null,
  stdoutExcerpt: "not read",
};

function reader(answer: { ok: boolean; status: number; body: unknown }) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const lines: string[] = [];
  const fetch: RunsFetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return { ok: answer.ok, status: answer.status, json: async () => answer.body };
  };
  const limits = paperclipReviewerLimits({
    fetch,
    apiUrl: "http://paperclip.test:3100",
    apiKey: { type: "secret_ref", secretId: "secret-paperclip" },
    resolve: async () => "test-key",
    companyId: "acme",
    now: new Date("2026-11-26T06:00:00Z"),
    log: (line) => lines.push(line),
  });
  return { limits, calls, lines };
}

verifies("paperclip.pr-watcher-reroute", () => {
  test("GETs a reviewer's 20 newest runs once per pass, with the key, and reads their limit", async () => {
    const { limits, calls } = reader({ ok: true, status: 200, body: [parkedRun] });
    expect(await limits("agent-liam")).toEqual({ why: "pool wait", since: parkedRun.createdAt });
    expect(await limits("agent-liam")).toMatchObject({ why: "pool wait" });
    expect(calls).toEqual([
      {
        url: "http://paperclip.test:3100/api/companies/acme/heartbeat-runs?agentId=agent-liam&limit=20",
        headers: { authorization: "Bearer test-key" },
      },
    ]);
  });

  test("answers unknown, and logs why, when Paperclip refuses or answers something else", async () => {
    for (const answer of [
      { ok: false, status: 403, body: {} },
      { ok: true, status: 200, body: { runs: [] } },
    ]) {
      const { limits, lines } = reader(answer);
      expect(await limits("agent-liam")).toBe("unknown");
      expect(lines[0]).toMatch(/^PR watcher: couldn't read agent-liam's runs: /);
    }
  });

  test("keeps only the fields the rules read, and skips what isn't a run", () => {
    expect(runRow(parkedRun)).toEqual({
      status: "scheduled_retry",
      scheduledRetryReason: "ai_connection_pool_wait",
      errorCode: null,
      error: null,
      createdAt: parkedRun.createdAt,
      startedAt: null,
      finishedAt: null,
    });
    expect(runRow({ status: "running" })).toBeNull();
    expect(runRow(null)).toBeNull();
  });

  test("reads nothing without the Paperclip API address and key in the settings", () => {
    const lines: string[] = [];
    const ctx = {
      http: { fetch: async () => new Response("[]") },
      secrets: { resolve: async () => "test-key" },
    };
    const pass = { companyId: "acme", now: new Date(), log: (line: string) => lines.push(line) };
    expect(
      reviewerLimitsOf(ctx, { paperclipApiUrl: "http://paperclip.test:3100" }, pass),
    ).toBeUndefined();
    expect(lines).toEqual([
      "PR watcher: no Paperclip API address or key set, so no review moves off a limited reviewer.",
    ]);
    const settings = {
      paperclipApiUrl: "http://paperclip.test:3100",
      paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
    };
    expect(reviewerLimitsOf(ctx, settings, pass)).toBeTypeOf("function");
  });
});
