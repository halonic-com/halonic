import { type ToolScriptReason, toolScriptMessageCharacters } from "@halonicjs/ports";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { type Builtins, callBuiltin, same } from "./builtins.ts";
import { hasOwn } from "./own-fields.ts";

/** Why the script stopped, as a listed reason and at most a short message (S13). */
export interface ScriptFailure {
  readonly reason: ToolScriptReason;
  readonly message?: string;
}

/** Cuts a message to the length a record keeps (S11, S13). */
export function shortMessage(message: string): string {
  return message.length <= toolScriptMessageCharacters
    ? message
    : message.slice(0, toolScriptMessageCharacters);
}

/**
 * A string own data property of a script's object, read through its
 * descriptor, so no getter runs. `undefined` for anything else.
 */
function ownStringField(
  vm: QuickJSContext,
  builtins: Builtins,
  object: QuickJSHandle,
  key: string,
): string | undefined {
  const keyHandle = vm.newString(key);
  const descriptor = callBuiltin(vm, builtins.getOwnPropertyDescriptor, object, keyHandle);
  keyHandle.dispose();
  if (descriptor === undefined || vm.typeof(descriptor) !== "object") return undefined;
  let text: string | undefined;
  if (hasOwn(vm, builtins, descriptor, "value")) {
    const value = vm.getProp(descriptor, "value");
    if (vm.typeof(value) === "string") text = vm.getString(value);
    value.dispose();
  }
  descriptor.dispose();
  return text;
}

/** Whether `error`'s prototype is the captured prototype of a built-in error. */
function isBuiltinError(
  vm: QuickJSContext,
  builtins: Builtins,
  error: QuickJSHandle,
  prototype: QuickJSHandle,
): boolean {
  const actual = callBuiltin(vm, builtins.getPrototypeOf, error);
  const matches = actual !== undefined && same(vm, builtins, actual, prototype);
  actual?.dispose();
  return matches;
}

/**
 * Maps what the isolate threw onto a listed reason. QuickJS reports a full
 * heap as an `InternalError` ("out of memory", "string too long") and a deep
 * recursion as a `RangeError`; anything else the script threw is
 * `toolscript.script-error` with its own message, never a stack. Reads
 * only own data properties and captured prototypes, so no script code runs.
 */
export function classifyThrown(
  vm: QuickJSContext,
  builtins: Builtins,
  thrown: QuickJSHandle,
): ScriptFailure {
  if (vm.typeof(thrown) === "string") {
    return { reason: "toolscript.script-error", message: shortMessage(vm.getString(thrown)) };
  }
  if (vm.typeof(thrown) !== "object" || same(vm, builtins, thrown, vm.null)) {
    return { reason: "toolscript.script-error" };
  }
  const message = ownStringField(vm, builtins, thrown, "message");
  if (isBuiltinError(vm, builtins, thrown, builtins.internalErrorPrototype)) {
    if (message === "out of memory" || message === "string too long") {
      return { reason: "limit.memory" };
    }
  }
  if (
    isBuiltinError(vm, builtins, thrown, builtins.rangeErrorPrototype) &&
    message === "Maximum call stack size exceeded"
  ) {
    return { reason: "limit.stack" };
  }
  return message === undefined
    ? { reason: "toolscript.script-error" }
    : { reason: "toolscript.script-error", message: shortMessage(message) };
}
