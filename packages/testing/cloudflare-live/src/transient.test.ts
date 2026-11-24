import type { CaseResult } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { retryInternalErrors, retryTransient } from "./transient.ts";

const bucketsUrl = "https://api.cloudflare.com/client/v4/accounts/acc123/r2/buckets";

/** A fetch that gives the answers in turn, the last one again once they run out. */
function answering(...answers: (() => Response)[]) {
  const sent: RequestInit[] = [];
  const doFetch: typeof fetch = async (_input, init) => {
    sent.push(init ?? {});
    const next = answers[Math.min(sent.length, answers.length) - 1];
    if (next === undefined) throw new Error("no answer");
    return next();
  };
  return { doFetch, sent };
}

const status =
  (code: number, headers: Record<string, string> = {}) =>
  () =>
    Response.json({ success: code < 400 }, { status: code, headers });

function recorder() {
  const waits: number[] = [];
  const lines: string[] = [];
  return {
    waits,
    lines,
    sleep: async (ms: number) => {
      waits.push(ms);
    },
    log: (line: string) => lines.push(line),
  };
}

verifies("cloudflare-live.transient", () => {
  describe("retryTransient", () => {
    it("asks again after a 500 and leaves the account id out of the log", async () => {
      const { doFetch, sent } = answering(status(500), status(200));
      const r = recorder();
      const response = await retryTransient({ fetch: doFetch, ...r })(bucketsUrl, {
        method: "POST",
        body: "{}",
      });
      expect(response.status).toBe(200);
      expect(sent).toHaveLength(2);
      expect(sent[1]?.body).toBe("{}");
      expect(r.waits).toEqual([2_000]);
      expect(r.lines).toEqual([
        "Cloudflare answered 500 to POST /client/v4/accounts/<account>/r2/buckets; asking again in 2 s (try 2 of 4).",
      ]);
    });

    it("returns any other answer at once", async () => {
      const { doFetch, sent } = answering(status(403));
      const r = recorder();
      const response = await retryTransient({ fetch: doFetch, ...r })(bucketsUrl);
      expect(response.status).toBe(403);
      expect(sent).toHaveLength(1);
      expect(r.lines).toEqual([]);
    });

    it("returns the last answer after 4 tries, waiting 2, 4 and 8 seconds", async () => {
      const { doFetch, sent } = answering(status(503));
      const r = recorder();
      const response = await retryTransient({ fetch: doFetch, ...r })(new URL(bucketsUrl));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ success: false });
      expect(sent).toHaveLength(4);
      expect(r.waits).toEqual([2_000, 4_000, 8_000]);
    });

    it("waits as long as a 429's Retry-After asks, at most 30 seconds", async () => {
      const { doFetch } = answering(
        status(429, { "retry-after": "5" }),
        status(429, { "retry-after": "600" }),
        status(200),
      );
      const r = recorder();
      const response = await retryTransient({ fetch: doFetch, ...r })(
        new Request(bucketsUrl, { method: "GET" }),
      );
      expect(response.status).toBe(200);
      expect(r.waits).toEqual([5_000, 30_000]);
    });

    it("asks again when the connection fails, but not when the request's time ran out", async () => {
      let calls = 0;
      const flaky: typeof fetch = async () => {
        calls++;
        if (calls === 1) throw new TypeError("fetch failed");
        return status(200)();
      };
      const r = recorder();
      expect((await retryTransient({ fetch: flaky, ...r })(bucketsUrl)).status).toBe(200);
      expect(r.lines[0]).toContain("failed to connect");

      const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
      const slow: typeof fetch = async () => {
        throw timeout;
      };
      await expect(retryTransient({ fetch: slow, ...recorder() })(bucketsUrl)).rejects.toBe(
        timeout,
      );
      const down: typeof fetch = async () => {
        throw new TypeError("fetch failed");
      };
      await expect(
        retryTransient({ fetch: down, ...recorder(), attempts: 2 })(bucketsUrl),
      ).rejects.toThrow("fetch failed");
    });

    it("returns the answer it has when the request's time ran out while waiting", async () => {
      const { doFetch, sent } = answering(status(500), status(200));
      const controller = new AbortController();
      const response = await retryTransient({
        fetch: doFetch,
        log: () => {},
        sleep: async () => controller.abort(),
      })(bucketsUrl, { signal: controller.signal });
      expect(response.status).toBe(500);
      expect(sent).toHaveLength(1);
    });
  });

  describe("retryInternalErrors", () => {
    const passed: CaseResult = { status: "passed", assertions: 3 };
    const internal: CaseResult = {
      status: "failed",
      assertions: 0,
      message: "Error: internal error; reference = 2fhs638mla8j5akolnctj339",
    };
    const wrong: CaseResult = { status: "failed", assertions: 1, message: "expected 2, got 1" };

    function runner(...results: CaseResult[]) {
      const ran: string[] = [];
      return {
        ran,
        run: async (id: string) => {
          ran.push(id);
          return results[Math.min(ran.length, results.length) - 1] ?? passed;
        },
      };
    }

    it("runs a case again after a Cloudflare internal error", async () => {
      const cases = runner(internal, passed);
      const r = recorder();
      expect(await retryInternalErrors(cases, r).run("c1")).toEqual(passed);
      expect(cases.ran).toEqual(["c1", "c1"]);
      expect(r.waits).toEqual([2_000]);
      expect(r.lines[0]).toContain("Case c1 hit a Cloudflare internal error");
    });

    it("counts any other failure at once", async () => {
      const cases = runner(wrong, passed);
      expect(await retryInternalErrors(cases, recorder()).run("c2")).toEqual(wrong);
      expect(cases.ran).toEqual(["c2"]);
    });

    it("runs a case again when the edge answered Script not found, and throws on the last run", async () => {
      const page = new Error(
        "The test Worker answered POST /run with 500: <!DOCTYPE html>\n<title>Script not found | hlt-1-1-adapters-w.example.workers.dev | Cloudflare</title>",
      );
      let runs = 0;
      const edge = {
        run: async () => {
          runs++;
          if (runs < 3) throw page;
          return passed;
        },
      };
      const r = recorder();
      expect(await retryInternalErrors(edge, r).run("c4")).toEqual(passed);
      expect(r.lines[0]).toContain("Script not found page");
      runs = -10;
      await expect(retryInternalErrors(edge, recorder()).run("c4")).rejects.toBe(page);
      const other = new Error("The test Worker answered POST /run with 401: no");
      const refused = { run: async (): Promise<CaseResult> => Promise.reject(other) };
      await expect(retryInternalErrors(refused, recorder()).run("c5")).rejects.toBe(other);
    });

    it("gives up after 3 runs", async () => {
      const cases = runner(internal);
      const r = recorder();
      expect(await retryInternalErrors(cases, r).run("c3")).toEqual(internal);
      expect(cases.ran).toHaveLength(3);
      expect(r.waits).toEqual([2_000, 4_000]);
    });
  });
});
