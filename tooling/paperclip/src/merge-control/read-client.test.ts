import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import {
  etagCache,
  meteredWrites,
  passReader,
  type ReadFetch,
  ReadRefused,
} from "./read-client.ts";

/** Placeholder tokens: the host's timer would write a fresh one every 10 minutes. */
const firstToken = "placeholder-read-token-1";
const secondToken = "placeholder-read-token-2";

interface Answer {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** A fake GitHub answering from `answers` in order, recording each request's token. */
function fakeGitHub(answers: Answer[]) {
  const sent: { method: string; url: string; auth: string; etag: string | undefined }[] = [];
  const fetch: ReadFetch = async (url, init) => {
    sent.push({
      method: init.method,
      url,
      auth: init.headers["authorization"] ?? "",
      etag: init.headers["if-none-match"],
    });
    const answer = answers.shift() ?? { status: 200, body: {} };
    const headers = new Headers(answer.headers ?? {});
    return {
      ok: answer.status < 300,
      status: answer.status,
      headers,
      json: async () => answer.body,
    };
  };
  return { fetch, sent };
}

function tokens() {
  const values = [firstToken, secondToken];
  return vi.fn(async () => values.shift() ?? secondToken);
}

const rateLimited = (remaining: string) => ({
  "x-ratelimit-remaining": remaining,
  "x-ratelimit-reset": String(Date.parse("2026-11-24T12:41:00Z") / 1000),
});

verifies("paperclip.merge-control-api-budget", () => {
  test("a pass reads the token once at its start and sends it on every GET and query", async () => {
    const github = fakeGitHub([
      { status: 200, body: [], headers: rateLimited("14000") },
      {
        status: 200,
        body: { data: { rateLimit: { remaining: 4900, resetAt: "2026-11-24T12:30:00Z" } } },
      },
      { status: 200, body: [] },
    ]);
    const token = tokens();
    const reader = await passReader({ fetch: github.fetch, token, etags: etagCache() });
    await reader.get("/repos/acme/app/actions/runs");
    await reader.query("query Q { rateLimit { remaining resetAt } }", {});
    await reader.get("/repos/acme/app/pulls");
    expect(token).toHaveBeenCalledTimes(1);
    expect(github.sent.map((request) => request.auth)).toEqual([
      `Bearer ${firstToken}`,
      `Bearer ${firstToken}`,
      `Bearer ${firstToken}`,
    ]);
    expect(reader.calls()).toEqual({ calls: 3, remaining: 4900, resetAt: "2026-11-24T12:30:00Z" });
  });

  test("a 401 reads the token once more and retries once; a second 401 refuses the pass", async () => {
    const github = fakeGitHub([
      { status: 401, body: { message: "Bad credentials" } },
      { status: 200, body: ["ok"] },
      { status: 401, body: { message: "Bad credentials" } },
    ]);
    const token = tokens();
    const reader = await passReader({ fetch: github.fetch, token, etags: etagCache() });
    expect(await reader.get("/repos/acme/app/pulls")).toEqual(["ok"]);
    expect(token).toHaveBeenCalledTimes(2);
    expect(github.sent.map((request) => request.auth)).toEqual([
      `Bearer ${firstToken}`,
      `Bearer ${secondToken}`,
    ]);
    const refused = await reader.get("/repos/acme/app/issues").catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ReadRefused);
    expect(token).toHaveBeenCalledTimes(2);
    expect(String(refused)).not.toContain("placeholder-read-token");
  });

  test("GitHub's own limit used up refuses the pass with its reset time", async () => {
    const github = fakeGitHub([
      { status: 403, body: { message: "API rate limit exceeded" }, headers: rateLimited("0") },
    ]);
    const reader = await passReader({ fetch: github.fetch, token: tokens(), etags: etagCache() });
    await expect(reader.get("/repos/acme/app/pulls")).rejects.toThrow(
      new ReadRefused("GitHub's limit for the read token is used up until 12:41 UTC."),
    );
  });

  test("a GET sends the last answer's ETag, and a 304 gives that answer without counting a call", async () => {
    const etags = etagCache();
    const github = fakeGitHub([
      { status: 200, body: ["first"], headers: { etag: 'W/"abc"' } },
      { status: 304 },
    ]);
    const first = await passReader({ fetch: github.fetch, token: tokens(), etags });
    await first.get("/repos/acme/app/actions/runs");
    const second = await passReader({ fetch: github.fetch, token: tokens(), etags });
    expect(await second.get("/repos/acme/app/actions/runs")).toEqual(["first"]);
    expect(github.sent[1]?.etag).toBe('W/"abc"');
    expect(second.calls().calls).toBe(0);
  });

  test("a 304 the plugin SDK can't rebuild as a Response gives the kept answer (HAL-20170)", async () => {
    const etags = etagCache();
    const github = fakeGitHub([{ status: 200, body: ["first"], headers: { etag: 'W/"abc"' } }]);
    const first = await passReader({ fetch: github.fetch, token: tokens(), etags });
    await first.get("/repos/acme/app/actions/runs");
    const sdkFetch: ReadFetch = async () => {
      // What the SDK's worker does with the host's 304: `new Response("", { status: 304 })`.
      return new Response("", { status: 304 });
    };
    const second = await passReader({ fetch: sdkFetch, token: tokens(), etags });
    expect(await second.get("/repos/acme/app/actions/runs")).toEqual(["first"]);
    expect(second.calls().calls).toBe(0);
    const empty = await passReader({ fetch: sdkFetch, token: tokens(), etags: etagCache() });
    await expect(empty.get("/repos/acme/app/actions/runs")).rejects.toThrow(TypeError);
  });

  test("writes are counted on their own, with the remaining limit their answers name", async () => {
    const github = fakeGitHub([{ status: 200, body: {}, headers: rateLimited("4200") }]);
    const writes = meteredWrites(github.fetch);
    await writes.fetch("https://api.github.com/graphql", { method: "POST", headers: {} });
    expect(writes.calls()).toEqual({
      calls: 1,
      remaining: 4200,
      resetAt: "2026-11-24T12:41:00.000Z",
    });
  });
});
