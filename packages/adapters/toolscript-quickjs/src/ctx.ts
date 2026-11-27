import {
  isToolScriptStop,
  type ToolScriptIsolateFunction,
  type ToolScriptIsolateValue,
} from "@halonicjs/ports";
import type { QuickJSDeferredPromise, QuickJSHandle } from "quickjs-emscripten-core";
import { callBuiltin } from "./builtins.ts";
import { copyIn } from "./copy-in.ts";
import { type CopyOutRules, copyOut } from "./copy-out.ts";
import { handleIdPrefix } from "./handles.ts";
import { shortMessage } from "./script-errors.ts";
import type { RunState } from "./session.ts";

/** `ctx`'s own members, which no host function may take. */
const ownMembers = new Set(["input", "log", "fail"]);

/**
 * Builds `ctx`: a frozen object with no prototype that holds the frozen
 * input, `log`, `fail` and the host functions, each namespace frozen with no
 * prototype too, so `Object.getPrototypeOf(ctx)` and `Reflect` reach
 * nothing. `undefined` when the run already failed.
 */
export function buildCtx(state: RunState): QuickJSHandle | undefined {
  const { vm } = state;
  const ctx = vm.newObject(vm.null);
  const input = copyInput(state);
  if (input === undefined) return undefined;
  define(state, ctx, "input", input);
  define(
    state,
    ctx,
    "log",
    hostFunction(state, "log", (args) => writeLog(state, args)),
  );
  define(
    state,
    ctx,
    "fail",
    hostFunction(state, "fail", (args) => stopRun(state, args)),
  );
  for (const [name, entry] of Object.entries(state.request.functions)) {
    if (ownMembers.has(name)) {
      state.fail("toolscript.failed", `a host function can't be named ${name}`);
      return undefined;
    }
    if (typeof entry === "function") {
      define(state, ctx, name, capability(state, name, entry));
      continue;
    }
    const namespace = vm.newObject(vm.null);
    for (const [method, implementation] of Object.entries(entry)) {
      define(state, namespace, method, capability(state, `${name}.${method}`, implementation));
    }
    define(state, ctx, name, freeze(state, namespace));
  }
  return freeze(state, ctx);
}

/** The input, copied in; `undefined` and a `toolscript.bad-input` failure for data that isn't plain. */
function copyInput(state: RunState): QuickJSHandle | undefined {
  try {
    return copyIn(state.vm, state.builtins, state.table, state.request.input);
  } catch {
    // copyIn throws a TypeError for a value that isn't plain data, and a
    // RangeError for one nested too deep to walk; either way the caller's input is bad.
    return state.fail("toolscript.bad-input", "the input isn't plain data");
  }
}

function define(state: RunState, owner: QuickJSHandle, key: string, value: QuickJSHandle): void {
  state.vm.defineProp(owner, key, { value, enumerable: true, configurable: false });
  value.dispose();
}

function freeze(state: RunState, handle: QuickJSHandle): QuickJSHandle {
  callBuiltin(state.vm, state.builtins.freeze, handle)?.dispose();
  return handle;
}

/** A frozen function in the isolate that ignores its `this`. */
function hostFunction(
  state: RunState,
  name: string,
  implementation: (args: QuickJSHandle[]) => QuickJSHandle | undefined,
): QuickJSHandle {
  const handle = state.vm.newFunction(name, (...args) => {
    if (state.closed()) return undefined;
    return implementation(args);
  });
  return freeze(state, handle);
}

/** The rules for one host call's argument (ADR 2.3: 8 KB, 8 levels, 100 items). */
function argumentRules(state: RunState): CopyOutRules {
  return {
    maxDepth: state.limits.argumentDepth,
    maxItems: state.limits.argumentItems,
    maxBytes: state.limits.argumentBytes,
    handles: "resolve",
    handleReason: "toolscript.bad-handle",
    shapeReason: "toolscript.bad-argument",
    sizeReason: "toolscript.bad-argument",
  };
}

/**
 * A host function on `ctx`. It copies the argument out (S15), counts the
 * call and the pending promises against the limits, and calls the host
 * outside the isolate, on a later host tick, so host code never runs while
 * the isolate does. The run may have ended by that tick (a limit tripped
 * while the script kept running): then the host is never called.
 */
function capability(
  state: RunState,
  name: string,
  implementation: ToolScriptIsolateFunction,
): QuickJSHandle {
  return hostFunction(state, name, (args) => {
    state.calls += 1;
    if (state.calls > state.limits.calls) return state.fail("limit.calls");
    if (state.pending >= state.limits.pendingPromises) return state.fail("limit.promises");
    if (args.length > 1) return state.fail("toolscript.bad-argument");
    const [argument] = args;
    const copied =
      argument === undefined
        ? ({ ok: true, value: null } as const)
        : copyOut(state.vm, state.builtins, state.table, argument, argumentRules(state));
    if (!copied.ok) return state.fail(copied.reason);
    const deferred = state.vm.newPromise();
    state.pending += 1;
    const context = { runId: state.request.runId, signal: state.signal };
    Promise.resolve()
      .then(() => (state.closed() ? null : implementation(copied.value, context)))
      .then(
        (value) => settle(state, deferred, { ok: true, value }),
        (error: unknown) => settle(state, deferred, { ok: false, error }),
      );
    return deferred.handle;
  });
}

type Outcome =
  | { readonly ok: true; readonly value: ToolScriptIsolateValue }
  | { readonly ok: false; readonly error: unknown };

/**
 * Settles a host call's promise in the isolate. After the run has ended
 * nothing reaches the isolate. A host function's own error message is never
 * passed on, because it may echo upstream text (S13); only a
 * `ToolScriptStop` names a reason.
 */
function settle(state: RunState, deferred: QuickJSDeferredPromise, outcome: Outcome): undefined {
  state.pending -= 1;
  if (state.closed()) return;
  if (!outcome.ok) {
    const { error } = outcome;
    if (!isToolScriptStop(error)) return state.fail("toolscript.capability-failed");
    const message = error.message === error.reason ? undefined : shortMessage(error.message);
    return state.fail(error.reason, message);
  }
  let result: QuickJSHandle;
  try {
    result = copyIn(state.vm, state.builtins, state.table, outcome.value);
  } catch {
    // copyIn throws only a TypeError, for a value that isn't plain data.
    return state.fail(
      "toolscript.capability-failed",
      "a host function answered with data that isn't plain",
    );
  }
  state.meter.inside(() => deferred.resolve(result));
  result.dispose();
  state.wake();
  return undefined;
}

/** `ctx.log(value)`: a string, or plain data written as JSON, cut to `logLineCharacters`. */
function writeLog(state: RunState, args: QuickJSHandle[]): undefined {
  if (state.log.length >= state.limits.logLines) return state.fail("limit.log");
  const [value] = args;
  let line: string;
  if (value !== undefined && state.vm.typeof(value) === "string") {
    line = state.vm.getString(value);
    if (line.includes(handleIdPrefix)) return state.fail("toolscript.bad-handle");
  } else {
    const copied =
      value === undefined
        ? ({ ok: true, value: null } as const)
        : copyOut(state.vm, state.builtins, state.table, value, {
            ...argumentRules(state),
            handles: "refuse",
          });
    if (!copied.ok) return state.fail(copied.reason);
    line = JSON.stringify(copied.value);
  }
  state.log.push(line.slice(0, state.limits.logLineCharacters));
  return undefined;
}

/**
 * `ctx.fail(message)`: ends the run at once with `toolscript.failed` and the
 * message, cut to `toolScriptMessageCharacters`. It is the isolate's own
 * member, not a host function, so it takes effect before the script's next
 * line, `await` or not, and throws so the script unwinds. A message that
 * isn't a string is dropped; one holding a handle id fails the run with
 * `toolscript.bad-handle`, as `log` does.
 */
function stopRun(state: RunState, args: QuickJSHandle[]): never {
  const [value] = args;
  if (value === undefined || state.vm.typeof(value) !== "string") {
    state.fail("toolscript.failed");
  } else {
    const message = state.vm.getString(value);
    if (message.includes(handleIdPrefix)) state.fail("toolscript.bad-handle");
    else state.fail("toolscript.failed", shortMessage(message));
  }
  // The run has already ended with the reason above, which wins over this
  // error; throwing only makes the script stop here.
  throw new Error("ctx.fail ended the run");
}
