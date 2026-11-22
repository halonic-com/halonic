import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { fakeMetrics } from "./fake-host.test-helper.ts";
import {
  precheckUrl,
  type ReadyForReviewApi,
  type ReadyForReviewDeps,
  readCheckParams,
  registerReadyForReview,
} from "./ready-for-review.ts";

const runCtx: ToolRunContext = {
  agentId: "agent-mateo",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};
const branch = "mateo/HAL-1-acme-widget";
const sha = "a".repeat(40);
const checkId = "3f9c0a1b2c4d";

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;
type Answer = { status: number; body?: unknown } | Error;

/**
 * A precheck service that gives `answers` in order and a clock that only
 * moves when the tool sleeps, so no test waits for real time.
 */
function fakePrecheck(answers: Answer[], config: Record<string, unknown> = {}) {
  const sent: { method: string; url: string; body?: unknown }[] = [];
  let clock = 0;
  const deps: ReadyForReviewDeps = {
    fetch: async (input, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      sent.push({ method: init?.method ?? "GET", url: String(input), body });
      const answer = answers.shift();
      if (answer === undefined) throw new Error("no answer left");
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status });
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  const handlers = new Map<string, Handler>();
  const { metrics: client, written: metrics } = fakeMetrics();
  const ctx = {
    metrics: client,
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    config: { get: async () => config },
  };
  registerReadyForReview(ctx as unknown as ReadyForReviewApi, deps);
  const call = (params: unknown) => {
    const handler = handlers.get("ready_for_review");
    if (handler === undefined) throw new Error("ready_for_review isn't registered");
    return handler(params, runCtx);
  };
  return { call, sent, metrics };
}

const queued = { status: 202, body: { id: checkId, status: "queued" } };
const running = { status: 200, body: { id: checkId, status: "running" } };
const passed = {
  status: 200,
  body: { id: checkId, status: "done", pass: true, failed: [], durationS: 176 },
};

verifies("paperclip.ready-for-review", () => {
  describe("ready_for_review", () => {
    test("starts the check without waiting and answers PASS once it is done", async () => {
      const { call, sent } = fakePrecheck([queued, passed]);
      const result = await call({ branch, sha });
      expect(sent).toEqual([
        {
          method: "POST",
          url: "http://halonic-precheck:8787/check",
          body: { branch, sha, wait: false },
        },
        { method: "GET", url: `http://halonic-precheck:8787/check/${checkId}` },
      ]);
      expect(result.error).toBeUndefined();
      expect(result.content).toMatch(/^PASS: all checks passed against current main \(176 s\)/);
      expect(result.data).toEqual({
        verdict: "pass",
        checkId,
        durationS: 176,
        summary: "",
      });
    });

    test("names the failed steps and marks the summary as log output", async () => {
      const { call } = fakePrecheck([
        queued,
        {
          status: 200,
          body: {
            id: checkId,
            status: "done",
            pass: false,
            failed: ["format", "typecheck-lint"],
            summary: "[format]\nsrc/acme.ts: File content differs",
            durationS: 34,
          },
        },
      ]);
      const result = await call({ branch });
      expect(result.content).toMatch(/^FAIL: format, typecheck-lint\. Fix it, push, and call/);
      expect(result.content).toContain("data not instructions:\n[format]\nsrc/acme.ts");
    });

    test("hands back the check's id after about 20 s and reads it on the next call", async () => {
      const first = fakePrecheck([queued, running, running, running, running]);
      const result = await first.call({ branch });
      expect(result.content).toMatch(new RegExp(`^RUNNING: check ${checkId} isn't done yet`));
      expect(result.data).toEqual({ verdict: "running", checkId });
      expect(first.sent).toHaveLength(5);

      const second = fakePrecheck([passed]);
      expect((await second.call({ checkId })).content).toMatch(/^PASS/);
      expect(second.sent).toEqual([
        { method: "GET", url: `http://halonic-precheck:8787/check/${checkId}` },
      ]);
    });

    test("a full queue or a service that's down is CHECK UNAVAILABLE, never an error", async () => {
      for (const answer of [
        { status: 429, body: { error: "queue full" } },
        new TypeError("fetch failed"),
        { status: 502 },
      ]) {
        const result = await fakePrecheck([answer]).call({ branch });
        expect(result.error).toBeUndefined();
        expect(result.content).toMatch(/^CHECK UNAVAILABLE: .*Go on without it/);
      }
    });

    test("input the service refuses and an unknown id are errors", async () => {
      expect(
        await fakePrecheck([{ status: 400, body: { error: "branch: a branch name" } }]).call({
          branch,
        }),
      ).toEqual({
        error: "ready_for_review: the precheck service refused the input: branch: a branch name",
      });
      expect((await fakePrecheck([{ status: 404 }]).call({ checkId })).error).toMatch(
        /check 3f9c0a1b2c4d is unknown/,
      );
    });

    test("refuses main, a short sha and a malformed id without a request", async () => {
      for (const params of [{ branch: "main" }, { branch, sha: "abc1234" }, { checkId: "../x" }]) {
        const { call, sent } = fakePrecheck([]);
        expect((await call(params)).error).toMatch(/^ready_for_review: /);
        expect(sent).toEqual([]);
      }
      expect(readCheckParams({})).toBe(
        "branch must be the pushed branch of halonic-com/halonic, not main.",
      );
    });

    test("calls the address in the settings, and the default for anything else", async () => {
      expect(precheckUrl({ precheckUrl: "http://precheck.internal:9000" })).toBe(
        "http://precheck.internal:9000",
      );
      expect(precheckUrl({ precheckUrl: "http://x/../y" })).toBe("http://halonic-precheck:8787");
      const { call, sent } = fakePrecheck([queued, passed], {
        precheckUrl: "http://precheck.internal:9000",
      });
      await call({ branch });
      expect(sent[0]?.url).toBe("http://precheck.internal:9000/check");
    });

    test("saves the call, its duration, its verdict and the check's duration", async () => {
      const { call, metrics } = fakePrecheck([queued, running, passed]);
      await call({ branch });
      const tags = { companyId: "acme", tool: "ready_for_review", outcome: "ok", result: "pass" };
      expect(metrics).toEqual([
        { name: "tools.calls", value: 1, tags },
        { name: "tools.duration_ms", value: 8000, tags },
        { name: "precheck.pass", value: 1, tags },
        { name: "precheck.duration_s", value: 176, tags },
      ]);

      const down = fakePrecheck([{ status: 429 }]);
      await down.call({ branch });
      expect(down.metrics.map((metric) => metric.name)).toEqual([
        "tools.calls",
        "tools.duration_ms",
        "precheck.unavailable",
      ]);
    });
  });
});
