import { toolScriptDefaultLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import type { QuickJSContext, QuickJSRuntime } from "quickjs-emscripten-core";
import { expect, it } from "vitest";
import type { Builtins } from "./builtins.ts";
import { CpuMeter } from "./cpu-meter.ts";
import { isWasmTrap, RunSession } from "./session.ts";

/** A session whose context throws `error` the moment the host enters it. */
function sessionThrowing(error: Error): RunSession {
  const vm = {
    evalCode: () => {
      throw error;
    },
  } as unknown as QuickJSContext;
  const limits = toolScriptDefaultLimits.agent;
  return new RunSession({
    runtime: {} as QuickJSRuntime,
    vm,
    builtins: {} as Builtins,
    meter: new CpuMeter(limits.cpuMs),
    request: { runId: "acme-run", code: "", input: null, functions: {}, limits },
    limits,
    prelude: "",
  });
}

/** A `RuntimeError`, as a WASM trap or an Emscripten abort throws it. */
function runtimeError(message: string): Error {
  return Object.assign(new Error(message), { name: "RuntimeError" });
}

verifies("toolscript-quickjs.isolate", () => {
  it("ends a run whose WASM memory traps with limit.memory, never the raw trap", async () => {
    for (const message of ["memory access out of bounds", "Aborted(Assertion failed)"]) {
      const result = await sessionThrowing(runtimeError(message)).run();
      expect(result).toMatchObject({ ok: false, reason: "limit.memory" });
      expect(JSON.stringify(result)).not.toContain(message);
    }
  });

  it("passes any other host error on, as the bug it is", async () => {
    await expect(sessionThrowing(new TypeError("acme bug")).run()).rejects.toThrow("acme bug");
    expect(isWasmTrap(new TypeError("x"))).toBe(false);
  });
});
