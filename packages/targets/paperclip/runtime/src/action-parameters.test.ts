import { type Tool, type ToolActionName, toolActionInfo } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeTool } from "./fake-host.test-helper.ts";
import { type ActionCall, type ActionHandler, runtimeHandlers } from "./handlers.ts";

/**
 * Holds every handler to the parameters its action declares in the format,
 * so the list `halonic validate` checks tool files against can't drift from
 * what the code reads.
 */

/** A value each declared parameter accepts, so a handler reads on past it. */
const sampleValues: Readonly<Record<string, unknown>> = {
  pr: 7,
  repo: "acme/website",
  task: "HAL-1",
  comments: 2,
  document: "plan",
  id: "card",
  since: "2026-11-24T00:00:00Z",
};

/** The handlers this runtime ships, with their action names. */
function shippedHandlers(): [ToolActionName, ActionHandler][] {
  return Object.entries(runtimeHandlers).flatMap(([name, handler]) =>
    handler === undefined ? [] : [[name as ToolActionName, handler]],
  );
}

/** The parameters with a sample value each; a declared name without one fails the test. */
function sampleParams(names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    names.map((name) => {
      if (!(name in sampleValues)) {
        throw new Error(`add a sample value for '${name}' to this test`);
      }
      return [name, sampleValues[name]];
    }),
  );
}

/**
 * Runs the handler with `params` behind a proxy that records every name it
 * reads, and with GitHub, Paperclip and plugin state that record a request and then fail,
 * so nothing past the parameters matters.
 */
async function runRecording(name: ToolActionName, handler: ActionHandler, params: object) {
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
  const refuse = (what: string) => async () => {
    requests.push(what);
    throw new Error(`no ${what} in this test`);
  };
  const call: ActionCall = {
    tool: acmeTool("tool_under_test", {
      action: { run: name, with: { repositories: ["acme/website"] } } as Tool["action"],
    }),
    params: recorded,
    templates: [{ id: "card", body: "## Question" }],
    caller: { agentId: "agent-mateo", urlKey: "mateo", name: "Mateo" },
    companyId: "acme",
    now: new Date("2026-11-25T00:00:00Z"),
    paperclip: {
      agents: { list: refuse("Paperclip") },
      issues: { get: refuse("Paperclip") },
      state: { get: refuse("plugin state") },
    } as unknown as ActionCall["paperclip"],
    github: refuse("GitHub"),
  };
  const result = await handler.run(call).catch((error: Error) => ({ error: error.message }));
  return { read, requests, result };
}

verifies("runtime.action-parameters", () => {
  describe.each(shippedHandlers())("%s", (name, handler) => {
    const declared = toolActionInfo(name).parameters;

    test("reads exactly the parameters its action declares", async () => {
      const params = sampleParams(declared.map((parameter) => parameter.name));
      const { read } = await runRecording(name, handler, params);
      expect([...read].sort()).toEqual(declared.map((parameter) => parameter.name).sort());
    });

    test.each(declared.filter((parameter) => parameter.required))(
      "answers an error before any request without $name",
      async (missing) => {
        const others = declared.filter((parameter) => parameter.name !== missing.name);
        const params = sampleParams(others.map((parameter) => parameter.name));
        const { requests, result } = await runRecording(name, handler, params);
        expect(result.error).toBeDefined();
        expect(requests).toEqual([]);
      },
    );
  });
});
