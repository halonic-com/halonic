import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { afterEach, describe, expect, test, vi } from "vitest";
import { requiredAnswers } from "../pr-tools/required-workflows.test-helper.ts";
import { recording } from "../pr-watcher/fakes.test-helper.ts";
import { fakeMetrics } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";
import {
  readPrParams,
  registerTools,
  type ToolsApi,
  toolRequestTimeoutMs,
  toolTimeoutMs,
} from "./tools.ts";
import { plugin } from "./worker.ts";

const repos = ["halonic-com/halonic"];
const token = { type: "secret_ref", secretId: "secret-pr-watcher" };
const runCtx: ToolRunContext = {
  agentId: "agent-mateo",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

/** Where Paperclip's tool bridge stops a call with a bare "Tool execution timed out". */
const bridgeLimitMs = 15_000;

/** #4605 from the green recording, with the further answers pr_status reads. */
const pr4605 = {
  ...recording("green"),
  ...requiredAnswers("halonic-com/halonic", 4605, "1939fbf169fbda4b54561c1d29e52650527d0cf9"),
  "/repos/halonic-com/halonic/pulls/4605/files?per_page=100&page=1": [
    { filename: "docs/guides/review.md" },
  ],
  "/repos/halonic-com/halonic/issues/4605/timeline?per_page=100&page=1": [],
  "/repos/halonic-com/halonic/compare/main...1939fbf169fbda4b54561c1d29e52650527d0cf9": {
    behind_by: 0,
    merge_base_commit: { sha: "0b1d2c3e4f5061728394a5b6c7d8e9f001122334" },
  },
};

/** A tools context whose GitHub answers from `answers` (or never, with `hang`), with the handlers it registered. */
function fakeTools(
  config: Record<string, unknown>,
  answers: Record<string, unknown>,
  hang = false,
) {
  const handlers = new Map<string, Handler>();
  const sent: string[] = [];
  const { metrics: client, written: metrics } = fakeMetrics();
  const ctx = {
    metrics: client,
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    config: { get: async () => config },
    secrets: { resolve: async () => "test-token" },
    agents: {
      get: async (agentId: string) =>
        agentId === runCtx.agentId ? { id: agentId, urlKey: "mateo" } : null,
    },
    http: {
      fetch: async (url: string) => {
        sent.push(url);
        if (hang) return new Promise<Response>(() => {});
        const { pathname, search } = new URL(url);
        const body = answers[pathname + search];
        return body === undefined
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 });
      },
    },
  };
  registerTools(ctx as unknown as ToolsApi);
  const call = (name: string, params: unknown) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} isn't registered`);
    return handler(params, runCtx);
  };
  return { call, sent, metrics };
}

verifies("paperclip.pr-tools", () => {
  describe("the plugin's tools", () => {
    test("the worker registers pr_status, and answers without a token with an error", async () => {
      const harness = createTestHarness({ manifest, config: {} });
      await plugin.definition.setup(harness.ctx);
      expect(manifest.tools?.map((tool) => tool.name)).toEqual([
        "pr_status",
        "ci_failures",
        "rebase_pr",
        "write_pr",
        "queue_state",
        "ready_for_review",
        "board_asks",
        "board_waiting",
        "failed_runs",
        "merge_speed",
        "comment",
        "set_next_step",
        "finish_run",
        "trial_results",
        "review_verdict",
        "react",
      ]);
      expect(await harness.executeTool("pr_status", { pr: 4588 })).toEqual({
        error: "pr_status: no GitHub token is set in the plugin's settings.",
      });
    });

    test("refuses a pull request on a repository it doesn't watch, before any request", async () => {
      const { call, sent } = fakeTools({ githubToken: token }, {});
      expect(await call("pr_status", { pr: "https://github.com/someone/else/pull/7" })).toEqual({
        error: "pr_status: repo must be one of: halonic-com/halonic, halonic-com/cloud.",
      });
      expect(sent).toEqual([]);
    });
  });

  describe("a slow GitHub (HAL-17111)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    test("a call and each of its requests give up inside the tool bridge's limit", () => {
      expect(toolRequestTimeoutMs).toBeLessThan(toolTimeoutMs);
      expect(toolTimeoutMs).toBeLessThanOrEqual(bridgeLimitMs - 5_000);
    });

    test("a GitHub that never answers gets the tool's own error, not the bridge's time-out", async () => {
      vi.useFakeTimers();
      const { call, sent } = fakeTools({ githubToken: token }, {}, true);
      const pending = call("pr_status", { pr: 4605 });
      await vi.advanceTimersByTimeAsync(toolTimeoutMs);
      expect(await pending).toEqual({ error: "pr_status: pr_status took longer than 10 s." });
      expect(sent.length).toBeGreaterThan(0);
    });
  });

  test("reads pr as a number, a numeric string or a pull request URL", () => {
    expect(readPrParams({ pr: 4588 }, repos)).toEqual({
      repo: "halonic-com/halonic",
      number: 4588,
    });
    expect(readPrParams({ pr: "4588" }, repos)).toEqual({
      repo: "halonic-com/halonic",
      number: 4588,
    });
    expect(readPrParams({ pr: "https://github.com/halonic-com/halonic/pull/4588" }, repos)).toEqual(
      {
        repo: "halonic-com/halonic",
        number: 4588,
      },
    );
    expect(readPrParams({ pr: "4588/../../x" }, repos)).toBe(
      "pr must be a pull request number or its GitHub URL.",
    );
    expect(readPrParams({ pr: 1, repo: "other/repo" }, repos)).toBe(
      "repo must be one of: halonic-com/halonic.",
    );
  });
});

verifies("paperclip.agent-tools-metrics", () => {
  test("a tool call saves one call and its GitHub requests, tagged with the tool and outcome", async () => {
    const { call, sent, metrics } = fakeTools({ githubToken: token }, pr4605);
    await call("pr_status", { pr: 4605 });
    await call("pr_status", { pr: "https://github.com/someone/else/pull/7" });
    expect(metrics).toEqual([
      {
        name: "tools.calls",
        value: 1,
        tags: { companyId: "acme", tool: "pr_status", outcome: "ok" },
      },
      {
        name: "tools.github_requests",
        value: sent.length,
        tags: { companyId: "acme", tool: "pr_status", outcome: "ok" },
      },
      {
        name: "tools.calls",
        value: 1,
        tags: { companyId: "acme", tool: "pr_status", outcome: "error" },
      },
      {
        name: "tools.github_requests",
        value: 0,
        tags: { companyId: "acme", tool: "pr_status", outcome: "error" },
      },
    ]);
    expect(sent.length).toBeGreaterThan(0);
  });
});

verifies("paperclip.rebase-pr", () => {
  /** #4605 on Mateo's own branch in the repository, level with main. */
  const own4605 = {
    ...pr4605,
    "/repos/halonic-com/halonic/pulls/4605": {
      ...(recording("green")["/repos/halonic-com/halonic/pulls/4605"] as object),
      head: {
        sha: "1939fbf169fbda4b54561c1d29e52650527d0cf9",
        ref: "mateo/HAL-15342-inbox-retry-focus",
        repo: { full_name: "halonic-com/halonic" },
      },
    },
  };

  test("rebase_pr answers for the calling agent's own pull request, with GET requests only", async () => {
    const { call, sent } = fakeTools({ githubToken: token }, own4605);
    const result = await call("rebase_pr", { pr: 4605 });
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({ number: 4605, verdict: "up-to-date" });
    expect(result.content).toContain("up-to-date: it's up to date with main");
    expect(sent.every((url) => url.startsWith("https://api.github.com/"))).toBe(true);
  });

  test("rebase_pr refuses a pull request whose branch names no agent of the repository", async () => {
    const { call } = fakeTools({ githubToken: token }, pr4605);
    const result = await call("rebase_pr", { pr: 4605 });
    expect(result.data).toMatchObject({ verdict: "refused" });
    expect(result.content).toContain("its branch names no agent, or it comes from a fork");
  });
});
