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
 * is refused. Nothing carries over from one run to the next. It runs on any
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
  const inputBytes = new TextEncoder().encode(JSON.stringify(request.input)).length;
  if (inputBytes > limits.inputBytes) {
    return { ok: false, reason: "limit.input", log: [], limits };
  }
  // A module of its own per run: a fresh WASM memory that is dropped whole afterwards.
  const module = await newQuickJSWASMModuleFromVariant(
    import("@jitl/quickjs-ng-wasmfile-release-sync"),
  );
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
