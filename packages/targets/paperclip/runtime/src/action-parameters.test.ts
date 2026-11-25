import { type Tool, type ToolActionName, toolActionInfo } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeTool } from "./fake-host.test-helper.ts";
import { type ActionCall, type ActionHandler, runtimeHandlers } from "./handlers.ts";
import { paperclipAccess } from "./paperclip-access.ts";

/**
 * Holds every handler to the parameters its action declares in the format,
 * so the list `halonic validate` checks tool files against can't drift from
 * what the code reads.
 */

/**
 * Calls that pass each action's parameter checks, one per branch that reads
 * other names: together they reach every name the handler reads. An action
 * without a handler has none. A new action fails to compile here until it
 * has its calls.
 */
const sampleCalls: Readonly<Record<ToolActionName, readonly Readonly<Record<string, unknown>>[]>> =
  {
    "github.pull-request": [{ pr: 7, repo: "acme/website" }],
    "github.open-pull-requests": [{}],
    "github.merge-queue": [{}],
    "github.merge-times": [{}],
    "paperclip.task": [{ task: "HAL-1", comments: 2, document: "plan" }],
    "paperclip.failed-runs": [{ since: "2026-11-24T00:00:00Z" }],
    "paperclip.budgets": [{}],
    "paperclip.template": [{ id: "card" }],
    "paperclip.comment": [{ task: "HAL-1", body: "Done." }],
    "paperclip.next-step": [
      {
        task: "HAL-1",
        status: "in_progress",
        comment: "CI runs.",
        monitor: { inMinutes: 20, ref: "acme/website#7" },
      },
      { task: "HAL-1", status: "blocked", comment: "Waits.", blockedBy: ["HAL-2"] },
    ],
    "paperclip.finish-run": [
      { task: "HAL-1", outcome: "done", comment: "Merged." },
      { task: "HAL-1", outcome: "handoff", comment: "Ready.", to: "Liam" },
      { task: "HAL-1", outcome: "blocked", comment: "Waits.", blockedBy: ["HAL-2"] },
    ],
  };

/**
 * Names a handler looks at only to refuse them, so no tool file may declare
 * them: `set_next_step` never hands a task on.
 */
const readOnlyToRefuse: Readonly<Partial<Record<ToolActionName, readonly string[]>>> = {
  "paperclip.next-step": ["to", "assignee", "assigneeAgentId", "assigneeUserId"],
};

/** The handlers this runtime ships, with their action names. */
function shippedHandlers(): [ToolActionName, ActionHandler][] {
  return Object.entries(runtimeHandlers).flatMap(([name, handler]) =>
    handler === undefined ? [] : [[name as ToolActionName, handler]],
  );
}

/**
 * A host whose every client, at any depth, records its path when called and
 * then fails, so nothing past the parameters matters.
 */
function refusingHost(requests: string[], path = "host"): never {
  const refuse = () => {
    requests.push(path);
    return Promise.reject(new Error(`no ${path} in this test`));
  };
  return new Proxy(refuse, {
    get: (_, key) => refusingHost(requests, `${path}.${String(key)}`),
  }) as never;
}

/**
 * Runs the handler with `params` behind a proxy that records every name it
 * reads, with Paperclip cut down to its capabilities as the runtime does.
 */
async function runRecording(
  name: ToolActionName,
  handler: ActionHandler,
  params: Readonly<Record<string, unknown>>,
) {
  const read = new Set<string>();
  const requests: string[] = [];
  const recorded = new Proxy(params, {
    get: (target, key, receiver) => {
      if (typeof key === "string") {
        read.add(key);
      }
      return Reflect.get(target, key, receiver);
    },
  });
  const call: ActionCall = {
    tool: acmeTool("tool_under_test", {
      action: { run: name, with: { repositories: ["acme/website"] } } as Tool["action"],
    }),
    params: recorded,
    templates: [{ id: "card", body: "## Question" }],
    caller: { agentId: "agent-mateo", urlKey: "mateo", name: "Mateo" },
    companyId: "acme",
    now: new Date("2026-11-25T00:00:00Z"),
    paperclip: paperclipAccess(refusingHost(requests), handler.capabilities, {
      companyId: "acme",
      runId: "run-1",
    }),
    github: refusingHost(requests, "github"),
    githubQuery: refusingHost(requests, "githubQuery"),
  };
  const result = await handler.run(call).catch((error: Error) => ({ error: error.message }));
  return { read, requests, result };
}

verifies("runtime.action-parameters", () => {
  describe.each(shippedHandlers())("%s", (name, handler) => {
    const declared = toolActionInfo(name).parameters;
    const calls = sampleCalls[name];

    test("reads exactly the parameters its action declares", async () => {
      expect(calls.length).toBeGreaterThan(0);
      const read = new Set<string>();
      for (const params of calls) {
        for (const key of Object.keys(params)) {
          expect(declared.map((parameter) => parameter.name)).toContain(key);
        }
        const run = await runRecording(name, handler, params);
        for (const key of run.read) read.add(key);
      }
      for (const refused of readOnlyToRefuse[name] ?? []) read.delete(refused);
      expect([...read].sort()).toEqual(declared.map((parameter) => parameter.name).sort());
    });

    test.each(declared.filter((parameter) => parameter.required))(
      "answers an error before any request without $name",
      async (missing) => {
        const { [missing.name]: _left, ...params } = calls[0] ?? {};
        const { requests, result } = await runRecording(name, handler, params);
        expect(result.error).toBeDefined();
        expect(requests).toEqual([]);
      },
    );
  });
});
