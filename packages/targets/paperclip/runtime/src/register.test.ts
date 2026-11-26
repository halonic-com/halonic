import { toolActionNames } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { pluginActions, runtimeCapabilities } from "./actions.ts";
import {
  acmeSnapshot,
  acmeTool,
  builtIn,
  fakeHost,
  githubToken,
  publishedSnapshot,
} from "./fake-host.test-helper.ts";
import { type Fetch, gitHubReader } from "./github.ts";
import type { ActionCall, ActionHandlers } from "./handlers.ts";
import type { ToolDeclaration } from "./host.ts";
import { registerWorkspaceTools } from "./register.ts";

const declarations: ToolDeclaration[] = ["my_prs", "pr_status"].map((name) => ({
  name,
  displayName: name,
  description: `Acme's ${name}.`,
  parametersSchema: { type: "object", properties: {} },
}));

/** Handlers that record each call and read one GitHub path, so the token wiring shows. */
function recordingHandlers() {
  const calls: ActionCall[] = [];
  const run = async (call: ActionCall) => {
    calls.push(call);
    await (await call.github())("/repos/acme/website");
    return { content: `ran ${call.tool.action.run}` };
  };
  const handlers: ActionHandlers = {
    "github.pull-request": { capabilities: [], run },
    "github.open-pull-requests": { capabilities: [], run },
  };
  return { calls, handlers };
}

/** A host with the acme tools registered, and the snapshot the settings pin, if any. */
async function plugin(pinned?: unknown, handlers = recordingHandlers()) {
  const published = pinned === undefined ? undefined : await publishedSnapshot(pinned);
  const config = { githubToken, ...published?.pin };
  const host = fakeHost(config, { ...published?.answers, "/repos/acme/website": {} });
  registerWorkspaceTools(host.ctx, { declarations, builtIn, handlers: handlers.handlers });
  return { ...host, calls: handlers.calls };
}

verifies("runtime.tools", () => {
  describe("a declared tool", () => {
    test("runs its action with the served snapshot's settings, as the caller", async () => {
      const { call, calls, sent, metrics } = await plugin();
      expect(await call("pr_status", { pr: 7 })).toEqual({ content: "ran github.pull-request" });
      expect(calls[0]?.tool).toEqual(builtIn.tools[1]);
      expect(calls[0]?.params).toEqual({ pr: 7 });
      expect(calls[0]?.caller).toEqual({
        agentId: "agent-mateo",
        urlKey: "mateo",
        name: "Mateo",
      });
      expect(sent).toEqual(["https://api.github.com/repos/acme/website"]);
      expect(metrics).toEqual([
        {
          name: "tools.calls",
          value: 1,
          tags: { companyId: "acme", tool: "pr_status", outcome: "ok" },
        },
      ]);
    });

    test("is off when the pinned snapshot leaves it out, re-points it or changes its parameters", async () => {
      const moved = acmeTool("pr_status", {
        action: { run: "github.merge-queue", with: { repositories: ["acme/website"] } },
      });
      const withParameter = acmeTool("pr_status", {
        parameters: { pr: { type: "integer", description: "The number.", required: true } },
      });
      for (const tools of [[acmeTool("my_prs")], [moved], [withParameter]]) {
        const { call, calls } = await plugin(acmeSnapshot({ tools }));
        const answer = await call("pr_status", {});
        expect(answer.error).toMatch(/^pr_status is off: the workspace snapshot 1{40} /);
        expect(calls).toEqual([]);
      }
    });

    test("is off when the runtime has no handler for its action", async () => {
      const { call } = await plugin(undefined, { calls: [], handlers: {} });
      expect(await call("my_prs", {})).toEqual({
        error: "my_prs is off: this plugin runtime can't run github.open-pull-requests yet.",
      });
    });

    test("refuses a caller its callers don't name", async () => {
      const onlyPriya = acmeTool("pr_status", { callers: { agents: ["priya"] } });
      const { call, calls } = await plugin(
        acmeSnapshot({ tools: [acmeTool("my_prs"), onlyPriya] }),
      );
      expect(await call("pr_status", {})).toEqual({
        error: "pr_status: this tool isn't offered to the calling agent.",
      });
      expect(calls).toEqual([]);
    });

    test("matches callers by the agent's urlKey, ignoring case, never by its display name", async () => {
      const onlyPriya = acmeTool("pr_status", { callers: { agents: ["priya"] } });
      const host = await plugin(acmeSnapshot({ tools: [acmeTool("my_prs"), onlyPriya] }));
      host.agent.name = "priya";
      expect(await host.call("pr_status", {})).toEqual({
        error: "pr_status: this tool isn't offered to the calling agent.",
      });
      expect(host.calls).toEqual([]);

      const offeredToMateo = acmeTool("pr_status", { callers: { agents: ["Mateo"] } });
      const { call } = await plugin(acmeSnapshot({ tools: [acmeTool("my_prs"), offeredToMateo] }));
      expect(await call("pr_status", {})).toEqual({ content: "ran github.pull-request" });
    });

    test("doesn't follow a redirect with the token", async () => {
      const sent: string[] = [];
      // Follows a redirect the way `fetch` does unless the request says `redirect: "error"`.
      const fetch: Fetch = async (url, init) => {
        sent.push(url);
        if (init.redirect === "error") {
          throw new TypeError("fetch failed: redirect mode is set to error");
        }
        sent.push("https://example.com/steal");
        return new Response("{}", { status: 200 });
      };
      const get = gitHubReader({ fetch, token: "test-token" });
      await expect(get("/repos/acme/website")).rejects.toThrow("redirect mode is set to error");
      expect(sent).toEqual(["https://api.github.com/repos/acme/website"]);
    });

    test("reads GitHub only with the read token set in the settings", async () => {
      const host = fakeHost({}, {});
      const handlers = recordingHandlers();
      registerWorkspaceTools(host.ctx, { declarations, builtIn, handlers: handlers.handlers });
      expect(await host.call("pr_status", {})).toEqual({
        error: "pr_status: no GitHub read token is set in the plugin's settings.",
      });
      const get = gitHubReader({ fetch: host.ctx.http.fetch, token: "test-token" });
      await expect(get("https://example.com/steal")).rejects.toThrow(
        "GitHub: refusing to send the token to https://example.com.",
      );
      expect(host.sent).toEqual([]);
    });
  });

  describe("the action list for the builder", () => {
    test("lists every action of the format, and only the ones with a handler as available", () => {
      const actions = pluginActions();
      expect(actions.map((action) => action.name)).toEqual(toolActionNames());
      expect(actions.filter((action) => action.available).map((action) => action.name)).toEqual([
        "github.pull-request",
        "github.open-pull-requests",
        "github.merge-queue",
        "github.merge-times",
        "paperclip.task",
        "paperclip.failed-runs",
        "paperclip.budgets",
        "paperclip.seat-rules",
        "paperclip.template",
        "paperclip.comment",
        "paperclip.next-step",
        "paperclip.finish-run",
        "paperclip.propose-budget",
        "halonic.precheck",
      ]);
      expect(actions[0]).toMatchObject({ name: "github.pull-request", keys: ["github-read"] });
      expect(actions.find((action) => action.name === "paperclip.template")).toMatchObject({
        writes: false,
        keys: [],
        capabilities: [],
      });
      const withHandler = pluginActions({
        "paperclip.failed-runs": { capabilities: ["issues.read"], run: async () => ({}) },
      });
      expect(withHandler.find((action) => action.name === "paperclip.failed-runs")).toMatchObject({
        available: true,
        capabilities: ["issues.read"],
      });
      expect(runtimeCapabilities).toContain("secrets.read-ref");
    });
  });
});
