import type { ToolScriptIsolate, ToolScriptIsolateRequest } from "@halonicjs/ports";
import { toolScriptDefaultLimits } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { held, recorder, runScript, script } from "./harness.ts";

/** A fake isolate that only records the requests the harness sends it. */
function fakeIsolate(requests: ToolScriptIsolateRequest[]) {
  return {
    limits: toolScriptDefaultLimits.user,
    run: async (request: ToolScriptIsolateRequest) => {
      requests.push(request);
      return { ok: true, output: "fake", log: [], limits: request.limits } as const;
    },
  } satisfies ToolScriptIsolate;
}

describe("fence harness", () => {
  it("wraps a body as a run function in a module", () => {
    expect(script("return 1;")).toBe("export async function run(ctx) {\nreturn 1;\n}\n");
  });

  it("sends each run a fresh id, the agent defaults lowered by the run, and its input", async () => {
    const requests: ToolScriptIsolateRequest[] = [];
    const make = () => fakeIsolate(requests);
    const result = await runScript(make, "code", { input: { name: "acme" }, limits: { calls: 7 } });
    await runScript(make, "code");
    expect(result).toMatchObject({ ok: true, output: "fake" });
    expect(requests[0]).toMatchObject({
      code: "code",
      input: { name: "acme" },
      functions: {},
      limits: { ...toolScriptDefaultLimits.agent, calls: 7 },
    });
    expect(requests[0]?.runId).not.toBe(requests[1]?.runId);
    expect(requests[1]?.input).toBeNull();
  });

  it("records each call and answers with the given value", async () => {
    const acme = recorder("pong");
    const context = { runId: "acme-run", signal: new AbortController().signal };
    expect(await acme.fn({ n: 1 }, context)).toBe("pong");
    expect(acme.calls).toEqual([{ n: 1 }]);
  });

  it("holds every call until it is released", async () => {
    const slow = held();
    const context = { runId: "acme-run", signal: new AbortController().signal };
    const answers = [slow.fn(null, context), slow.fn(null, context)];
    expect(slow.calls).toBe(2);
    slow.release("done");
    expect(await Promise.all(answers)).toEqual(["done", "done"]);
  });
});
