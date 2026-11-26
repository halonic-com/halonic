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
  const calls: { url: string; headers: Record<string, string>; redirect: string }[] = [];
  const lines: string[] = [];
  const fetch: RunsFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, redirect: init.redirect });
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
        redirect: "error",
      },
    ]);
  });

  test("answers unknown, and logs a fixed code, when Paperclip refuses or answers something else", async () => {
    for (const [answer, code] of [
      [{ ok: false, status: 403, body: {} }, "http_403"],
      [{ ok: true, status: 200, body: { runs: [] } }, "not_a_list"],
    ] as const) {
      const { limits, lines } = reader(answer);
      expect(await limits("agent-liam")).toBe("unknown");
      expect(lines).toEqual([`PR watcher: couldn't read agent-liam's runs: ${code}`]);
    }
  });

  test("logs a failed call's error name, never its message", async () => {
    const lines: string[] = [];
    const limits = paperclipReviewerLimits({
      fetch: async () => {
        throw new TypeError("fetch failed: secret-looking text from the answer");
      },
      apiUrl: "http://paperclip.test:3100",
      apiKey: { type: "secret_ref", secretId: "secret-paperclip" },
      resolve: async () => "test-key",
      companyId: "acme",
      now: new Date("2026-11-26T06:00:00Z"),
      log: (line) => lines.push(line),
    });
    expect(await limits("agent-liam")).toBe("unknown");
    expect(lines).toEqual(["PR watcher: couldn't read agent-liam's runs: TypeError"]);
  });

  test("sends its GET through the Node fetch it is given, never the host's, refusing redirects and with a timeout", async () => {
    const hostCalls: string[] = [];
    const ctx = { secrets: { resolve: async () => "test-key" } };
    const host = {
      http: { fetch: async (url: string) => (hostCalls.push(url), new Response("[]")) },
    };
    const sent: { url: string; init: Parameters<RunsFetch>[1] }[] = [];
    const nodeFetch: RunsFetch = async (url, init) => {
      sent.push({ url, init });
      return { ok: true, status: 200, json: async () => [parkedRun] };
    };
    const settings = {
      paperclipApiUrl: "http://paperclip.test:3100",
      paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
    };
    const pass = { companyId: "acme", now: new Date("2026-11-26T06:00:00Z"), log: () => {} };
    const limits = reviewerLimitsOf({ ...ctx, ...host }, nodeFetch, settings, pass);
    expect(await limits?.("agent-liam")).toMatchObject({ why: "pool wait" });
    expect(hostCalls).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.init).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer test-key" },
      redirect: "error",
    });
    expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
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
    const ctx = { secrets: { resolve: async () => "test-key" } };
    const nodeFetch: RunsFetch = async () => ({ ok: true, status: 200, json: async () => [] });
    const pass = { companyId: "acme", now: new Date(), log: (line: string) => lines.push(line) };
    expect(
      reviewerLimitsOf(ctx, nodeFetch, { paperclipApiUrl: "http://paperclip.test:3100" }, pass),
    ).toBeUndefined();
    expect(lines).toEqual([
      "PR watcher: no Paperclip API address or key set, so no review moves off a limited reviewer.",
    ]);
    const settings = {
      paperclipApiUrl: "http://paperclip.test:3100",
      paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
    };
    expect(reviewerLimitsOf(ctx, nodeFetch, settings, pass)).toBeTypeOf("function");
  });
});
