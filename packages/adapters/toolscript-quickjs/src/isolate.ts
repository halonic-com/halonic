import {
  effectiveToolScriptLimits,
  type ToolScriptIsolate,
  type ToolScriptIsolateRequest,
  type ToolScriptIsolateResult,
  type ToolScriptLimits,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import { captureBuiltins } from "./builtins.ts";
import { CpuMeter } from "./cpu-meter.ts";
import { engineForRun } from "./engine.ts";
import { preludeSource, quickJsIntrinsics } from "./prelude.ts";
import { RunSession } from "./session.ts";

/** Options for {@link createQuickJsToolScriptIsolate}. */
export interface QuickJsToolScriptIsolateOptions {
  /** The most a run gets; the user defaults of ADR 2.3 when left out. */
  readonly limits?: ToolScriptLimits;
}

/**
 * A `ToolScriptIsolate` on QuickJS-ng compiled to WebAssembly (ADR
 * "Halonic ToolScript" 2.1). Every run gets a WASM module, runtime and
 * context of its own, with the pinned intrinsics, the checked eval prelude,
 * the memory, stack and CPU limits, and no module loader, so `import()`
 * is refused. Nothing carries over from one run to the next. A host
 * function named `input`, `log` or `fail`, the names of `ctx`'s own members, ends
 * the run with `toolscript.failed` before the script runs; an aborted
 * `signal` ends it with `toolscript.cancelled`, and one aborted before the
 * run starts means the script never runs. It runs on any
 * runtime with WebAssembly; the worker wrappers that keep it off the main
 * thread come separately.
 *
 * @example
 * const isolate = createQuickJsToolScriptIsolate();
 * const result = await isolate.run({ runId, code, input, functions, limits });
 */
export function createQuickJsToolScriptIsolate(
  options: QuickJsToolScriptIsolateOptions = {},
): ToolScriptIsolate {
  const limits = options.limits ?? toolScriptDefaultLimits.user;
  return {
    limits,
    // Async, so request limits that `effectiveToolScriptLimits` refuses reject instead of throwing.
    run: async (request) =>
      runInQuickJs(request, effectiveToolScriptLimits(limits, request.limits)),
  };
}

/**
 * One run in a module of its own. `prelude` is replaced only by the tests
 * that check a broken prelude stops the run before any script code runs.
 */
export async function runInQuickJs(
  request: ToolScriptIsolateRequest,
  limits: ToolScriptLimits,
  prelude: string = preludeSource,
): Promise<ToolScriptIsolateResult> {
  if (request.signal?.aborted)
    return { ok: false, reason: "toolscript.cancelled", log: [], limits };
  const inputBytes = jsonBytes(request.input);
  if (inputBytes === undefined) {
    return { ok: false, reason: "toolscript.bad-input", log: [], limits };
  }
  if (inputBytes > limits.inputBytes) {
    return { ok: false, reason: "limit.input", log: [], limits };
  }
  // A module instance of its own per run, in a fresh WASM memory of a fixed
  // size that is dropped whole afterwards. The fixed size is the hard memory
  // limit: QuickJS's own limit doesn't count large strings (HAL-17776).
  const module = await newQuickJSWASMModuleFromVariant(engineForRun(limits.memoryBytes).variant);
  const meter = new CpuMeter(limits.cpuMs);
  const runtime = module.newRuntime({
    memoryLimitBytes: limits.memoryBytes,
    maxStackSizeBytes: limits.stackBytes,
    interruptHandler: meter.shouldInterrupt,
  });
  const vm = runtime.newContext({ intrinsics: quickJsIntrinsics });
  const builtins = captureBuiltins(vm);
  return new RunSession({ runtime, vm, builtins, meter, request, limits, prelude }).run();
}

/** The size of `value` as UTF-8 JSON, or `undefined` when it can't be written as JSON (a cycle, a BigInt). */
function jsonBytes(value: unknown): number | undefined {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return undefined;
  }
}
