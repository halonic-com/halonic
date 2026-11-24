import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";

/** The built-ins the host reads the context through, taken before any script code runs. */
export interface Builtins {
  readonly getOwnPropertyDescriptor: QuickJSHandle;
  readonly hasOwn: QuickJSHandle;
  readonly ownKeys: QuickJSHandle;
  readonly is: QuickJSHandle;
  readonly getPrototypeOf: QuickJSHandle;
  readonly isFrozen: QuickJSHandle;
  readonly isArray: QuickJSHandle;
  readonly freeze: QuickJSHandle;
  readonly objectPrototype: QuickJSHandle;
  readonly arrayPrototype: QuickJSHandle;
  readonly internalErrorPrototype: QuickJSHandle;
  readonly rangeErrorPrototype: QuickJSHandle;
}

/**
 * Takes the built-ins from a fresh context, before the prelude or any
 * script code runs, so the script can't replace what the host uses.
 */
export function captureBuiltins(vm: QuickJSContext): Builtins {
  const global = (name: string): QuickJSHandle => vm.getProp(vm.global, name);
  const objectConstructor = global("Object");
  const arrayConstructor = global("Array");
  const internalError = global("InternalError");
  const rangeError = global("RangeError");
  const reflect = global("Reflect");
  const builtins: Builtins = {
    getOwnPropertyDescriptor: vm.getProp(objectConstructor, "getOwnPropertyDescriptor"),
    hasOwn: vm.getProp(objectConstructor, "hasOwn"),
    ownKeys: vm.getProp(reflect, "ownKeys"),
    is: vm.getProp(objectConstructor, "is"),
    getPrototypeOf: vm.getProp(objectConstructor, "getPrototypeOf"),
    isFrozen: vm.getProp(objectConstructor, "isFrozen"),
    isArray: vm.getProp(arrayConstructor, "isArray"),
    freeze: vm.getProp(objectConstructor, "freeze"),
    objectPrototype: vm.getProp(objectConstructor, "prototype"),
    arrayPrototype: vm.getProp(arrayConstructor, "prototype"),
    internalErrorPrototype: vm.getProp(internalError, "prototype"),
    rangeErrorPrototype: vm.getProp(rangeError, "prototype"),
  };
  for (const handle of [objectConstructor, arrayConstructor, internalError, rangeError, reflect]) {
    handle.dispose();
  }
  return builtins;
}

/** `Object.is(left, right)` in the context, through the captured built-in. */
export function same(
  vm: QuickJSContext,
  builtins: Builtins,
  left: QuickJSHandle,
  right: QuickJSHandle,
): boolean {
  const result = callBuiltin(vm, builtins.is, left, right);
  const equal = isTrue(vm, result);
  result?.dispose();
  return equal;
}

/** Calls a captured built-in and gives its result, or `undefined` if it threw. */
export function callBuiltin(
  vm: QuickJSContext,
  builtin: QuickJSHandle,
  ...args: QuickJSHandle[]
): QuickJSHandle | undefined {
  const result = vm.callFunction(builtin, vm.undefined, ...args);
  if (result.error) {
    result.error.dispose();
    return undefined;
  }
  return result.value;
}

/**
 * Whether `handle` is the boolean `true`. Read with `getNumber`, which turns
 * a boolean into 1 or 0 without running script code: this QuickJS build has
 * no equality API.
 */
export function isTrue(vm: QuickJSContext, handle: QuickJSHandle | undefined): boolean {
  return handle !== undefined && vm.typeof(handle) === "boolean" && vm.getNumber(handle) === 1;
}
