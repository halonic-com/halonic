import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  canary,
  fakeTransport,
  policy,
  redirect,
  refusal,
  secrets,
} from "./fake-transport.test-helper.ts";
import { retryDelayMs } from "./integration/index.ts";
import { createLimitedHttpClient, type RequestLimits } from "./limited-http.ts";
import { RequestLog } from "./request-log.ts";

const url = "https://api.example.com/v1/forecast";

/** The limited client over a fake transport, on the faked clock, so `retry-after` dates can be measured. */
function clockClient(answer: Parameters<typeof fakeTransport>[0], limits?: RequestLimits) {
  const { transport, sent } = fakeTransport(answer);
  const log = new RequestLog();
  const http = createLimitedHttpClient({
    policy,
    transport,
    secrets,
    log,
    now: () => Date.now(),
    ...(limits ? { limits } : {}),
  });
  return { http, sent, log };
}

/** An answer that gives the responses in turn, and the last one again once they run out. */
function inTurn(...responses: (() => Response)[]) {
  let next = 0;
  return () => {
    const respond = responses[Math.min(next++, responses.length - 1)];
    if (!respond) throw new Error("inTurn needs at least one response");
    return respond();
  };
}

function tooMany(headers: Record<string, string> = {}): () => Response {
  return () => new Response("slow down", { status: 429, headers });
}

const ok = () => new Response("ok");

/** The status and retry number of each log entry. */
function attempts(log: RequestLog) {
  return log.entries().map(({ status, retry }) => ({ status, retry }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("integration-kit.retry-rate-limited", () => {
  it.each(["GET", "HEAD"])(
    "sends a %s that gets 429 again after the wait retry-after asks",
    async (method) => {
      const { http, sent, log } = clockClient(inTurn(tooMany({ "retry-after": "2" }), ok));
      const pending = http.fetch(url, { method });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(sent).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).status).toBe(200);
      expect(sent.map((request) => request.method)).toEqual([method, method]);
      expect(attempts(log)).toEqual([
        { status: 429, retry: undefined },
        { status: 200, retry: 1 },
      ]);
    },
  );

  it("gives back the third 429 after two retries, and sends no fourth request", async () => {
    const { http, sent, log } = clockClient(tooMany());
    const pending = http.fetch(url);
    await vi.advanceTimersByTimeAsync(999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2_000);
    const response = await pending;
    expect(response.status).toBe(429);
    expect(await response.text()).toBe("slow down");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(3);
    expect(attempts(log)).toEqual([
      { status: 429, retry: undefined },
      { status: 429, retry: 1 },
      { status: 429, retry: 2 },
    ]);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "sends a %s that gets 429 only once",
    async (method) => {
      const { http, sent } = clockClient(inTurn(tooMany({ "retry-after": "1" }), ok));
      const response = await http.fetch(url, { method, body: "{}" });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(response.status).toBe(429);
      expect(sent).toHaveLength(1);
    },
  );

  it("doesn't retry when retry-after asks for more than 30 s", async () => {
    const { http, sent } = clockClient(inTurn(tooMany({ "retry-after": "31" }), ok));
    expect((await http.fetch(url)).status).toBe(429);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(1);
  });

  it("waits 30 s at most in total, and gives back the 429 that would go past it", async () => {
    const { http, sent } = clockClient(tooMany({ "retry-after": "20" }));
    const pending = http.fetch(url);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent).toHaveLength(2);
    expect((await pending).status).toBe(429);
  });

  it("waits the full 30 s when retry-after asks for exactly that", async () => {
    const { http, sent } = clockClient(inTurn(tooMany({ "retry-after": "30" }), ok));
    const pending = http.fetch(url);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await pending).status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it("measures a retry-after date against the response's date, whatever the local clock says", async () => {
    const headers = {
      date: "Thu, 15 Jan 2026 11:00:00 GMT",
      "retry-after": "Thu, 15 Jan 2026 11:00:05 GMT",
    };
    const { http, sent } = clockClient(inTurn(tooMany(headers), ok));
    const pending = http.fetch(url);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
  });

  it("measures a retry-after date against the local clock when there is no date header", async () => {
    const { http, sent } = clockClient(
      inTurn(tooMany({ "retry-after": "Thu, 15 Jan 2026 12:00:05 GMT" }), ok),
    );
    const pending = http.fetch(url);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
  });

  it("keeps a date measured against the local clock within the 30 s too", async () => {
    const { http, sent } = clockClient(
      inTurn(tooMany({ "retry-after": "Thu, 15 Jan 2026 13:00:00 GMT" }), ok),
    );
    expect((await http.fetch(url)).status).toBe(429);
    expect(sent).toHaveLength(1);
  });

  it("backs off 1 s, then 2 s, when retry-after can't be read", async () => {
    const { http, sent } = clockClient(inTurn(tooMany({ "retry-after": "soon" })));
    const pending = http.fetch(url);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(429);
    expect(sent).toHaveLength(3);
  });

  it("rejects at once when the signal aborts during the wait, and sends nothing more", async () => {
    const { http, sent, log } = clockClient(inTurn(tooMany({ "retry-after": "10" }), ok));
    const controller = new AbortController();
    const pending = http.fetch(url, { signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow("the user stopped the run");
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort(new Error("the user stopped the run"));
    await rejected;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(1);
    expect(attempts(log)).toEqual([{ status: 429, retry: undefined }]);
  });

  it("covers every attempt with one overall timeout, not one per attempt", async () => {
    const { http, sent } = clockClient(tooMany({ "retry-after": "2" }), { timeoutMs: 3_000 });
    const pending = http.fetch(url);
    const timedOut = expect(pending).rejects.toThrow("no complete response");
    await vi.advanceTimersByTimeAsync(3_000);
    await timedOut;
    expect(sent).toHaveLength(2);
  });

  it("places the secret again on each attempt, only for its declared host", async () => {
    const cdn = inTurn(tooMany(), ok);
    const { http, sent } = clockClient((to) =>
      to.host === "api.example.com"
        ? redirect(302, "https://cdn.example.com/forecast.json")
        : cdn(),
    );
    const pending = http.fetch(url, { auth: { secret: "example-key", as: "bearer" } });
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await pending).status).toBe(200);
    expect(sent.map((request) => [request.url, request.headers["authorization"]])).toEqual([
      [url, `Bearer ${canary["example-key"]}`],
      ["https://cdn.example.com/forecast.json", undefined],
      [url, `Bearer ${canary["example-key"]}`],
      ["https://cdn.example.com/forecast.json", undefined],
    ]);
  });

  it("starts a retry from the original URL and checks its redirects again", async () => {
    let apiAnswers = 0;
    const { http, sent } = clockClient((to) => {
      if (to.host === "cdn.example.com") return tooMany()();
      return apiAnswers++ === 0
        ? redirect(302, "https://cdn.example.com/forecast.json")
        : redirect(302, "https://evil.example/collect");
    });
    const pending = refusal(http.fetch(url));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toBe("host-not-allowed");
    expect(sent.map((request) => request.url)).toEqual([
      url,
      "https://cdn.example.com/forecast.json",
      url,
    ]);
  });

  it("closes the 429's body before the wait", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const { http, sent } = clockClient(
      inTurn(() => new Response(body, { status: 429, headers: { "retry-after": "5" } }), ok),
    );
    const pending = http.fetch(url);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(cancelled).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await pending).status).toBe(200);
  });

  it("doesn't retry a 500", async () => {
    const { http, sent } = clockClient(inTurn(() => new Response("down", { status: 500 }), ok));
    expect((await http.fetch(url)).status).toBe(500);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(1);
  });

  it.each([
    ["the first answer", [] as (() => Response)[], undefined],
    ["the answer to a retry", [tooMany()], 1],
  ])("logs %s that is too large as refused, not as ok", async (_what, before, retry) => {
    const tooLarge = () => new Response("12345", { headers: { "content-length": "5" } });
    const { http, log } = clockClient(inTurn(...before, tooLarge), { maxResponseBytes: 4 });
    const pending = refusal(http.fetch(url));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toBe("response-too-large");
    const last = log.entries().at(-1);
    expect(last).toMatchObject({ outcome: "refused", refusal: "response-too-large" });
    expect(last?.retry).toBe(retry);
    expect(log.entries()).toHaveLength(before.length + 1);
  });

  it("offers integrations the same waits, uncapped, for retries of their own", () => {
    const now = Date.now();
    expect(retryDelayMs(new Headers({ "retry-after": "120" }), 1, now)).toBe(120_000);
    expect(retryDelayMs(new Headers(), 1, now)).toBe(1_000);
    expect(retryDelayMs(new Headers(), 2, now)).toBe(2_000);
    expect(retryDelayMs(new Headers({ "retry-after": "-5" }), 1, now)).toBe(1_000);
    const past = new Headers({ "retry-after": "Thu, 15 Jan 2026 11:59:00 GMT" });
    expect(retryDelayMs(past, 1, now)).toBe(0);
  });
});
