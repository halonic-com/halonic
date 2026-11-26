import type { WorkerOptions } from "node:worker_threads";
import {
  effectiveToolScriptLimits,
  type ToolScriptIsolate,
  type ToolScriptIsolateResult,
  type ToolScriptLimits,
  toolScriptDefaultLimits,
  toolScriptMessageCharacters,
  toolScriptSecretHandle,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createNodeWorkerToolScriptIsolate, workerKillGraceMs } from "./index.ts";
import { workerIsolate } from "./worker-isolate.ts";
import { startWorker, workerStartLimitMs } from "./worker-run.ts";

const agent = toolScriptDefaultLimits.agent;

/**
 * An isolate whose workers run the stand-in, counting each start. The
 * stand-in does what the script's code says, such as `block`.
 */
function standIn(options: { maxWorkers?: number; startLimitMs?: number } = {}) {
  const starts: WorkerOptions[] = [];
  const isolate = workerIsolate(options, {
    entry: new URL("./test/stand-in-worker.spec.ts", import.meta.url),
    startWorker: (entry, workerOptions) => {
      starts.push(workerOptions);
      return startWorker(entry, workerOptions);
    },
    startLimitMs: options.startLimitMs ?? workerStartLimitMs,
  });
  return { isolate, starts };
}

function run(
  isolate: ToolScriptIsolate,
  code: string,
  options: { limits?: Partial<ToolScriptLimits>; signal?: AbortSignal; input?: unknown } = {},
): Promise<ToolScriptIsolateResult> {
  return isolate.run({
    runId: `acme-${crypto.randomUUID()}`,
    code,
    input: (options.input ?? null) as never,
    functions: {},
    limits: effectiveToolScriptLimits(isolate.limits, options.limits),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}

describe("createNodeWorkerToolScriptIsolate", () => {
  verifies("toolscript-quickjs-node.worker-isolate", () => {
    it("runs a script in a worker with the agent limits and gives its output", async () => {
      const isolate = createNodeWorkerToolScriptIsolate();
      expect(isolate.limits).toEqual(agent);
      const result = await run(isolate, "export function run(ctx) { return ctx.input.n + 1; }", {
        input: { n: 41 },
      });
      expect(result).toEqual({ ok: true, output: 42, log: [], limits: agent });
    });

    it("refuses host functions and secret handles before any worker starts", async () => {
      const { isolate, starts } = standIn();
      const withFunctions = await isolate.run({
        runId: "acme-1",
        code: "export function run() { return 1; }",
        input: null,
        functions: { acme: { ping: async () => null } },
        limits: agent,
      });
      expect(withFunctions).toMatchObject({
        ok: false,
        reason: "toolscript.failed",
        message: "This isolate takes no host functions.",
      });
      const withHandle = await run(isolate, "surroundings", {
        input: { token: toolScriptSecretHandle("acme") },
      });
      expect(withHandle).toMatchObject({ ok: false, reason: "toolscript.bad-input" });
      expect(starts).toEqual([]);
    });

    it("starts the worker with no env, argv, execArgv or workerData, and its heap capped", async () => {
      const { isolate, starts } = standIn();
      const result = await run(isolate, "surroundings");
      expect(result).toMatchObject({ ok: true, output: { env: [], execArgv: [], argv: [] } });
      expect(starts).toEqual([
        { env: {}, argv: [], execArgv: [], resourceLimits: expect.any(Object) },
      ]);
    });

    it("kills a worker that never reaches the interrupt check at its CPU limit plus the grace", async () => {
      const { isolate } = standIn();
      const cpuMs = 200;
      const startedAt = performance.now();
      const result = await run(isolate, "block", { limits: { cpuMs } });
      const tookMs = performance.now() - startedAt;
      expect(result).toEqual({
        ok: false,
        reason: "limit.cpu",
        log: [],
        limits: { ...agent, cpuMs },
      });
      expect(tookMs).toBeGreaterThanOrEqual(cpuMs + workerKillGraceMs);
    });

    it("kills a worker at its wall clock", async () => {
      const { isolate } = standIn();
      const result = await run(isolate, "block", { limits: { cpuMs: 1_000, wallClockMs: 100 } });
      expect(result).toMatchObject({ ok: false, reason: "limit.wall-clock" });
    });

    it("terminates a running worker with toolscript.cancelled when its signal aborts", async () => {
      const cancel = new AbortController();
      const isolate = workerIsolate(
        {},
        {
          entry: new URL("./test/stand-in-worker.spec.ts", import.meta.url),
          // Aborts once the worker has said it started, so the run is under way.
          startWorker: (entry, options) =>
            startWorker(entry, options).once("message", () => cancel.abort()),
          startLimitMs: workerStartLimitMs,
        },
      );
      const startedAt = performance.now();
      const result = await run(isolate, "block", { signal: cancel.signal });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.cancelled" });
      expect(performance.now() - startedAt).toBeLessThan(agent.cpuMs);
    });

    it("answers toolscript.failed for a worker that crashes, exits, or never starts, without its error", async () => {
      for (const behaviour of ["crash", "exit"]) {
        const result = await run(standIn().isolate, behaviour);
        expect(result, behaviour).toMatchObject({ ok: false, reason: "toolscript.failed" });
        expect(JSON.stringify(result), behaviour).not.toContain("acme-internal");
      }
      const never = standIn({ startLimitMs: 100 }).isolate;
      expect(await run(never, "never-start")).toMatchObject({
        ok: false,
        reason: "toolscript.failed",
      });
    });
  });

  verifies("toolscript-quickjs-node.parent-checks", () => {
    it("answers toolscript.failed for a result that isn't the right shape or protocol", async () => {
      for (const behaviour of ["malformed", "unknown"]) {
        const result = await run(standIn().isolate, behaviour);
        expect(result, behaviour).toEqual({
          ok: false,
          reason: "toolscript.failed",
          log: [],
          limits: agent,
        });
      }
    });

    it("measures the output itself and refuses one over outputBytes, whatever the worker says", async () => {
      const result = await run(standIn().isolate, "oversized");
      expect(result).toEqual({ ok: false, reason: "limit.output", log: [], limits: agent });
    });

    it("refuses a message longer than the cut", async () => {
      const result = await run(standIn().isolate, "long-message");
      expect(result).toMatchObject({ ok: false, reason: "toolscript.failed" });
    });

    it("passes the isolate's own cut of a long error message on", async () => {
      const isolate = createNodeWorkerToolScriptIsolate();
      const result = await run(
        isolate,
        'export function run() { throw new Error("x".repeat(1000)); }',
      );
      expect(!result.ok && result.message).toHaveLength(toolScriptMessageCharacters);
    });
  });

  verifies("toolscript-quickjs-node.worker-limit", () => {
    it("runs at most maxWorkers at once, starts the next in order, and never starts a cancelled one", async () => {
      const { isolate, starts } = standIn({ maxWorkers: 1 });
      const first = run(isolate, "block", { limits: { cpuMs: 100 } });
      const cancel = new AbortController();
      const cancelled = run(isolate, "block", { signal: cancel.signal });
      const second = run(isolate, "block", { limits: { cpuMs: 100 } });
      cancel.abort();
      expect(await cancelled).toMatchObject({ ok: false, reason: "toolscript.cancelled" });
      expect(starts).toHaveLength(1);
      // The second run's CPU limit starts with its own worker, so the first's wait doesn't count.
      expect(await first).toMatchObject({ ok: false, reason: "limit.cpu" });
      expect(await second).toMatchObject({ ok: false, reason: "limit.cpu" });
      expect(starts).toHaveLength(2);
    });

    it("refuses a worker limit below 1", () => {
      expect(() => createNodeWorkerToolScriptIsolate({ maxWorkers: 0 })).toThrow(RangeError);
    });
  });
});
