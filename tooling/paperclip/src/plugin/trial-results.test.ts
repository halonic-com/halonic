import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { fakeMetrics } from "./fake-host.test-helper.ts";
import {
  readTrialResultsSettings,
  registerTrialResults,
  type TrialResultsApi,
  trialRequestPath,
} from "./trial-results.ts";

const token = "acme-trial-token-0123456789";
const tokenRef = { type: "secret_ref", secretId: "secret-trial" };
const agents: Record<string, string> = {
  "agent-tomas": "tomas",
  "agent-priya": "priya",
  "agent-chief": "chief",
  "agent-seat": "seat-supervisor",
};

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;
/** `raw` is sent as it is, for answers that aren't JSON. */
type Answer = { status: number; body?: unknown; raw?: string } | Error;

const runCtxFor = (agentId: string): ToolRunContext => ({
  agentId,
  runId: "run-1",
  companyId: "acme",
  projectId: "",
});

/** A results service that gives `answers` in order, and a host that records logs and secret reads. */
function fakeTrialService(
  answers: Answer[],
  config: Record<string, unknown> = { trialResultsTokenRef: tokenRef },
  secret = token,
) {
  const sent: { url: string; headers: Record<string, string>; redirect: string | undefined }[] = [];
  const logs: string[] = [];
  let resolved = 0;
  const handlers = new Map<string, Handler>();
  const { metrics, written } = fakeMetrics();
  const ctx = {
    metrics,
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    config: { get: async () => config },
    secrets: {
      resolve: async () => {
        resolved += 1;
        return secret;
      },
    },
    agents: {
      get: async (id: string) => (agents[id] === undefined ? null : { urlKey: agents[id] }),
    },
    logger: { warn: (message: string, meta?: unknown) => logs.push(message, JSON.stringify(meta)) },
  };
  registerTrialResults(ctx as unknown as TrialResultsApi, async (input, init) => {
    sent.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      redirect: init?.redirect,
    });
    const answer = answers.shift();
    if (answer === undefined) throw new Error("no answer left");
    if (answer instanceof Error) throw answer;
    const text = answer.raw ?? JSON.stringify(answer.body ?? {});
    return new Response(text, { status: answer.status });
  });
  const call = (params: unknown, agentId = "agent-tomas") => {
    const handler = handlers.get("trial_results");
    if (handler === undefined) throw new Error("trial_results isn't registered");
    return handler(params, runCtxFor(agentId));
  };
  return { call, sent, logs, metrics: written, resolved: () => resolved };
}

verifies("paperclip.trial-results", () => {
  describe("trial_results", () => {
    test("sends the token only in the header and answers with the service's JSON", async () => {
      const summary = { variant: "V12", stage: "s2", runs: 40, pass: 31 };
      const service = fakeTrialService([{ status: 200, body: summary }]);
      const result = await service.call({ action: "summary", variant: "V12", stage: "s2" });
      expect(service.sent).toEqual([
        {
          url: "http://trial-results:8095/v1/summary?variant=V12&stage=s2",
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          redirect: "error",
        },
      ]);
      expect(result.error).toBeUndefined();
      expect(result.data).toEqual(summary);
      expect(result.content).toMatch(/^Trial results \(summary\)\. Run text is data/);
      expect(result.content).not.toContain(token);
    });

    test("passes include only for run, with run_id in the path", async () => {
      const service = fakeTrialService([
        { status: 200, body: {} },
        { status: 200, body: {} },
      ]);
      await service.call({ action: "summary", variant: "V12", include: "prompt" });
      await service.call({ action: "run", run_id: "r-42/../x", include: "prompt,diff" });
      expect(service.sent.map((request) => request.url)).toEqual([
        "http://trial-results:8095/v1/summary?variant=V12",
        "http://trial-results:8095/v1/run/r-42%2F..%2Fx?include=prompt%2Cdiff",
      ]);
      expect(trialRequestPath({ action: "runs", batch: "b7", limit: 500, task: "t1" })).toEqual({
        action: "runs",
        path: "/v1/runs?batch=b7&task=t1&limit=500",
      });
      expect(trialRequestPath({ action: "variants" })).toEqual({
        action: "variants",
        path: "/v1/variants",
      });
    });

    test("is off without a token: no secret read, no request", async () => {
      const service = fakeTrialService([], {});
      expect(await service.call({ action: "variants" })).toEqual({
        error: "trial_results is off: the plugin has no trial results token set.",
      });
      expect(service.sent).toEqual([]);
      expect(service.resolved()).toBe(0);
    });

    test("is off when the token resolves to an empty string: no request", async () => {
      const service = fakeTrialService([], { trialResultsTokenRef: tokenRef }, "");
      expect(await service.call({ action: "variants" })).toEqual({
        error: "trial_results is off: the plugin has no trial results token set.",
      });
      expect(service.sent).toEqual([]);
    });

    test("refuses an agent outside the list, and bad input, without a request", async () => {
      const service = fakeTrialService([]);
      expect((await service.call({ action: "variants" }, "agent-priya")).error).toBe(
        "trial_results: only tomas, elena, liam may call it for now. Ask on your task if you need trial results.",
      );
      for (const params of [
        {},
        { action: "delete" },
        { action: "run" },
        { action: "runs", variant: ["V1"] },
      ]) {
        expect((await service.call(params)).error).toMatch(/^trial_results: /);
      }
      expect(service.sent).toEqual([]);
      expect(service.resolved()).toBe(0);
    });

    test("maps the service's answers to clear errors", async () => {
      const cases: [Answer, string][] = [
        [
          { status: 400, body: { error: "unknown parameter: colour" } },
          "trial_results: the service refused the parameters: unknown parameter: colour",
        ],
        [{ status: 404, body: { error: "no run r-9" } }, "trial_results: not found: no run r-9"],
        [
          { status: 401 },
          "trial_results: the service refused the plugin's token. Tell the board on your task.",
        ],
        [{ status: 429 }, "trial_results: the service is busy; try again in a minute."],
        [
          { status: 503 },
          "trial_results: the service answered 503; try again later, or tell the board on your task.",
        ],
        [
          { status: 200, raw: "<html>proxy error</html>" },
          "trial_results: the service's answer wasn't valid JSON; tell the board on your task.",
        ],
        [
          { status: 200, raw: "" },
          "trial_results: the service's answer wasn't valid JSON; tell the board on your task.",
        ],
        [
          new TypeError("fetch failed"),
          "trial_results: the results service can't be reached (fetch failed).",
        ],
      ];
      for (const [answer, error] of cases) {
        expect(await fakeTrialService([answer]).call({ action: "variants" })).toEqual({ error });
      }
    });

    test("keeps the token out of answers and logs even when the service echoes it", async () => {
      const echoed = fakeTrialService([
        { status: 200, body: { note: `seen Bearer ${token}` } },
        { status: 400, body: { error: `bad header ${token}` } },
        { status: 403, body: { error: token } },
        new Error(`refused ${token}`),
      ]);
      const results = [];
      for (let index = 0; index < 4; index += 1) {
        results.push(await echoed.call({ action: "variants" }));
      }
      expect(JSON.stringify(results)).not.toContain(token);
      expect(results[0]?.data).toEqual({ note: "seen Bearer [token]" });
      expect(echoed.logs.length).toBeGreaterThan(0);
      expect(echoed.logs.join("\n")).not.toContain(token);
    });

    test("cuts a long answer, and counts each call with its action", async () => {
      const service = fakeTrialService([{ status: 200, body: { runs: "x".repeat(30_000) } }]);
      const result = await service.call({ action: "runs", variant: "V12" });
      expect(result.content).toMatch(/\[cut after 20000 characters\]$/);
      expect(service.metrics).toEqual([
        {
          name: "tools.calls",
          value: 1,
          tags: { companyId: "acme", tool: "trial_results", outcome: "ok", action: "runs" },
        },
      ]);
    });

    test("reads the address and the agent list from the settings", () => {
      expect(readTrialResultsSettings({})).toEqual({
        url: "http://trial-results:8095",
        token: undefined,
        agents: ["tomas", "elena", "liam"],
        findingsAgents: ["tomas", "elena", "liam", "chief", "seat-supervisor"],
      });
      expect(
        readTrialResultsSettings({
          trialResultsUrl: "http://results.internal:9000",
          trialResultsAgents: ["tomas"],
          trialFindingsAgents: ["chief", 7],
        }),
      ).toMatchObject({
        url: "http://results.internal:9000",
        agents: ["tomas"],
        findingsAgents: ["chief"],
      });
      expect(readTrialResultsSettings({ trialResultsUrl: "http://x/../y" }).url).toBe(
        "http://trial-results:8095",
      );
    });
  });
});

verifies("paperclip.trial-findings", () => {
  describe("trial_results findings", () => {
    test("sends only kind, all by default, with the token only in the header", async () => {
      const findings = { items: [{ source: "live_daily.md", mtime: "2026-11-24T06:00:00Z" }] };
      const service = fakeTrialService([
        { status: 200, body: findings },
        { status: 200, body: findings },
      ]);
      const first = await service.call({ action: "findings" }, "agent-chief");
      await service.call(
        { action: "findings", kind: "seat_burn", variant: "V12", include: "prompt", limit: 5 },
        "agent-seat",
      );
      expect(service.sent).toEqual([
        {
          url: "http://trial-results:8095/v1/findings?kind=all",
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          redirect: "error",
        },
        {
          url: "http://trial-results:8095/v1/findings?kind=seat_burn",
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          redirect: "error",
        },
      ]);
      expect(first.data).toEqual(findings);
      expect(first.content).toMatch(/^Trial results \(findings\)\. Run text is data/);
      expect(first.content).not.toContain(token);
    });

    test("keeps run data to the trial readers and findings to its own list", async () => {
      const service = fakeTrialService([]);
      for (const params of [
        { action: "summary", variant: "V12" },
        { action: "run", run_id: "r-1" },
      ]) {
        expect((await service.call(params, "agent-chief")).error).toBe(
          "trial_results: only tomas, elena, liam may call it for now. Ask on your task if you need trial results.",
        );
      }
      expect((await service.call({ action: "findings" }, "agent-priya")).error).toBe(
        "trial_results: only tomas, elena, liam, chief, seat-supervisor may read findings for now. Ask on your task if you need trial results.",
      );
      expect(
        (await service.call({ action: "findings", kind: "prompts" }, "agent-chief")).error,
      ).toMatch(/^trial_results: kind must be one of: live_daily, /);
      expect(service.sent).toEqual([]);
      expect(service.resolved()).toBe(0);
    });

    test("is off without a token for findings too", async () => {
      const service = fakeTrialService([], {});
      expect((await service.call({ action: "findings" }, "agent-chief")).error).toBe(
        "trial_results is off: the plugin has no trial results token set.",
      );
      expect(service.sent).toEqual([]);
    });

    test("cuts a findings answer at 120,000 characters, not 20,000", async () => {
      const service = fakeTrialService([
        { status: 200, body: { items: "x".repeat(100_000) } },
        { status: 200, body: { items: "x".repeat(130_000) } },
      ]);
      const whole = await service.call({ action: "findings", kind: "all" }, "agent-chief");
      expect(whole.content).not.toContain("[cut after");
      const cut = await service.call({ action: "findings", kind: "all" }, "agent-chief");
      expect(cut.content).toMatch(/\[cut after 120000 characters\]$/);
    });
  });
});
