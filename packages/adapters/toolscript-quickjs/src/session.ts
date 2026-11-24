import type {
  ToolScriptData,
  ToolScriptIsolateRequest,
  ToolScriptIsolateResult,
  ToolScriptIsolateValue,
  ToolScriptLimits,
  ToolScriptReason,
} from "@halonicjs/ports";
import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from "quickjs-emscripten-core";
import type { Builtins } from "./builtins.ts";
import { copyOut } from "./copy-out.ts";
import type { CpuMeter } from "./cpu-meter.ts";
import { buildCtx } from "./ctx.ts";
import { HandleTable } from "./handles.ts";
import { preludeHolds, removedGlobalsAbsent } from "./prelude.ts";
import { classifyThrown, type ScriptFailure } from "./script-errors.ts";

/** What one run's parts share: the context, its built-ins, the handle table and the run's state. */
export interface RunState {
  readonly vm: QuickJSContext;
  readonly builtins: Builtins;
  readonly table: HandleTable;
  readonly limits: ToolScriptLimits;
  readonly request: ToolScriptIsolateRequest;
  readonly meter: CpuMeter;
  readonly signal: AbortSignal;
  readonly log: string[];
  /** Whether the run has ended: nothing may enter the isolate any more. */
  closed(): boolean;
  /** Ends the run with `reason`; the first reason wins. Gives `undefined`, so a caller can return it. */
  fail(reason: ToolScriptReason, message?: string): undefined;
  /** Wakes the run loop after a host function settled. */
  wake(): void;
  /** Host calls that haven't settled yet. */
  pending: number;
  calls: number;
}

/**
 * One run in one fresh QuickJS runtime and context. The runtime belongs to
 * a WASM module made for this run alone, which is dropped whole when the
 * run ends, so nothing of it is ever entered again.
 */
export class RunSession implements RunState {
  readonly vm: QuickJSContext;
  readonly builtins: Builtins;
  readonly table = new HandleTable();
  readonly limits: ToolScriptLimits;
  readonly request: ToolScriptIsolateRequest;
  readonly meter: CpuMeter;
  readonly log: string[] = [];
  pending = 0;
  calls = 0;
  readonly #runtime: QuickJSRuntime;
  readonly #abort = new AbortController();
  #failure: ScriptFailure | undefined;
  #closed = false;
  #wake: (() => void) | undefined;

  readonly #prelude: string;

  constructor(parts: {
    readonly runtime: QuickJSRuntime;
    readonly vm: QuickJSContext;
    readonly builtins: Builtins;
    readonly meter: CpuMeter;
    readonly request: ToolScriptIsolateRequest;
    readonly limits: ToolScriptLimits;
    readonly prelude: string;
  }) {
    this.#runtime = parts.runtime;
    this.vm = parts.vm;
    this.builtins = parts.builtins;
    this.meter = parts.meter;
    this.request = parts.request;
    this.limits = parts.limits;
    this.#prelude = parts.prelude;
  }

  get signal(): AbortSignal {
    return this.#abort.signal;
  }

  closed(): boolean {
    return this.#closed || this.#failure !== undefined;
  }

  fail(reason: ToolScriptReason, message?: string): undefined {
    if (this.#failure !== undefined || this.#closed) return undefined;
    this.#failure = message === undefined ? { reason } : { reason, message };
    this.meter.stop();
    this.#abort.abort();
    this.wake();
    return undefined;
  }

  wake(): void {
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }

  /** Runs the script to its end and answers with the output or the reason it stopped. */
  async run(): Promise<ToolScriptIsolateResult> {
    const stopWatching = this.#watchClockAndCaller();
    try {
      const output = await this.#execute();
      return this.#result(output);
    } catch (error) {
      // A WASM trap (memory out of bounds, an abort near the fixed memory's
      // end) means the run's memory is spent. The module is the run's alone and
      // is dropped, so the trap ends this run with a fixed reason, never raw.
      if (!isWasmTrap(error)) throw error;
      this.fail("limit.memory");
      return this.#result(undefined);
    } finally {
      this.#closed = true;
      stopWatching();
      this.meter.stop();
      this.#abort.abort();
      this.table.clear();
    }
  }

  async #execute(): Promise<ToolScriptIsolateValue | undefined> {
    const prelude = this.#installPrelude();
    if (prelude === undefined) return undefined;
    const ctx = buildCtx(this);
    if (ctx === undefined) return undefined;
    // The script's own code, evaluated exactly once. After the prelude the host
    // never evaluates any other text, and none derived from the script or its
    // output (Julian's condition 5 on HAL-17650).
    const evaluated = this.meter.inside(() =>
      this.vm.evalCode(this.request.code, "script.js", { type: "module", strict: true }),
    );
    if (evaluated.error) return this.#failThrown(evaluated.error);
    const exports = await this.#settled(evaluated.value);
    if (exports === undefined) return undefined;
    const runFunction = this.vm.getProp(exports, "run");
    if (this.vm.typeof(runFunction) !== "function") {
      this.fail("toolscript.bad-artifact", "the script exports no run function");
      return undefined;
    }
    const called = this.meter.inside(() =>
      this.vm.callFunction(runFunction, this.vm.undefined, ctx),
    );
    if (called.error) return this.#failThrown(called.error);
    const returned = await this.#settled(called.value);
    if (returned === undefined) return undefined;
    this.#scriptDone();
    // Checked again after the run: a slot the script managed to change fails the run.
    if (!preludeHolds(this.vm, this.builtins, prelude)) {
      this.fail("toolscript.failed", "the eval prelude changed during the run");
      return undefined;
    }
    return this.#output(returned);
  }

  /** Runs the prelude on its own and checks every slot before any script code runs. */
  #installPrelude(): QuickJSHandle | undefined {
    const installed = this.meter.inside(() => this.vm.evalCode(this.#prelude, "prelude.js"));
    if (installed.error) {
      installed.error.dispose();
      this.fail("toolscript.failed", "the eval prelude failed");
      return undefined;
    }
    if (
      !preludeHolds(this.vm, this.builtins, installed.value) ||
      !removedGlobalsAbsent(this.vm, this.builtins, installed.value)
    ) {
      this.fail("toolscript.failed", "the eval prelude doesn't hold");
      return undefined;
    }
    return installed.value;
  }

  /** Runs the isolate's jobs until `handle` settles, waiting on host functions in between. */
  async #settled(handle: QuickJSHandle): Promise<QuickJSHandle | undefined> {
    for (;;) {
      if (this.closed()) return undefined;
      const state = this.vm.getPromiseState(handle);
      if (state.type === "fulfilled") return state.value;
      if (state.type === "rejected") return this.#failThrown(state.error);
      const ran = this.meter.inside(() => this.#runtime.executePendingJobs(1));
      if (ran.error) return this.#failThrown(ran.error);
      if (ran.value > 0) continue;
      if (this.pending === 0) {
        this.fail("toolscript.script-error", "the script waits on something that never finishes");
        return undefined;
      }
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  /**
   * The script's code never runs again, so the host's own reads (the prelude
   * check, the output copy, the error's message) may use memory past the
   * script's limit, as a full heap would make them fail.
   */
  #scriptDone(): void {
    this.#runtime.setMemoryLimit(-1);
  }

  #failThrown(thrown: QuickJSHandle): undefined {
    this.#scriptDone();
    if (this.meter.tripped) this.fail("limit.cpu");
    const failure = classifyThrown(this.vm, this.builtins, thrown);
    thrown.dispose();
    this.fail(failure.reason, failure.message);
    return undefined;
  }

  #output(returned: QuickJSHandle): ToolScriptIsolateValue | undefined {
    if (this.vm.typeof(returned) === "undefined") return null;
    const copied = copyOut(this.vm, this.builtins, this.table, returned, {
      maxDepth: 64,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxBytes: this.limits.outputBytes,
      handles: "refuse",
      // Liam on HAL-17741: a handle the script tries to return is a bad output.
      handleReason: "toolscript.bad-output",
      shapeReason: "toolscript.bad-output",
      sizeReason: "limit.output",
    });
    if (copied.ok) return copied.value;
    this.fail(copied.reason);
    return undefined;
  }

  #result(output: ToolScriptIsolateValue | undefined): ToolScriptIsolateResult {
    const trace = { log: [...this.log], limits: this.limits };
    const failure = this.#failure;
    if (failure !== undefined || output === undefined) {
      const { reason, message } = failure ?? { reason: "toolscript.failed" as const };
      return message === undefined
        ? { ...trace, ok: false, reason }
        : { ...trace, ok: false, reason, message };
    }
    // `#output` refused every handle, so what is left is plain data.
    return { ...trace, ok: true, output: output as ToolScriptData };
  }

  /** Starts the wall clock and listens for the caller's cancel; gives back a function that stops both. */
  #watchClockAndCaller(): () => void {
    const callerSignal = this.request.signal;
    const onCancel = (): void => this.fail("toolscript.cancelled");
    if (callerSignal?.aborted) onCancel();
    callerSignal?.addEventListener("abort", onCancel);
    const wallClockMs = this.limits.wallClockMs;
    const timer =
      wallClockMs === null
        ? undefined
        : setTimeout(() => this.fail("limit.wall-clock"), wallClockMs);
    return () => {
      callerSignal?.removeEventListener("abort", onCancel);
      if (timer !== undefined) clearTimeout(timer);
    };
  }
}

/** Whether `error` is a WebAssembly trap or an Emscripten abort, both `RuntimeError`s. */
export function isWasmTrap(error: unknown): boolean {
  return error instanceof Error && error.name === "RuntimeError";
}
