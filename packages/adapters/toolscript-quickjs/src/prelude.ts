import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { type Builtins, callBuiltin, isTrue, same } from "./builtins.ts";
import { ownDataField } from "./own-fields.ts";

/**
 * The language features each run's context gets (ADR 2.1). `Eval` stays on
 * because QuickJS compiles the script with it; the prelude then replaces
 * every path to the compiler. `Proxy`, typed arrays and bignum stay off
 * (Julian's condition 6 on HAL-17650).
 */
export const quickJsIntrinsics = Object.freeze({
  BaseObjects: true,
  Date: true,
  Eval: true,
  StringNormalize: true,
  RegExp: true,
  JSON: true,
  Proxy: false,
  MapSet: true,
  TypedArrays: false,
  Promise: true,
  BigInt: false,
  BigFloat: false,
  BigDecimal: false,
  OperatorOverloading: false,
  BignumExt: false,
});

/**
 * Globals that QuickJS-ng 0.18 always adds and the intrinsics can't switch
 * off: `BigInt` became part of the base objects, and explicit resource
 * management brought the other three. The engine the fence was first run on
 * had none of them, so the prelude takes them away again (HAL-17780).
 */
export const removedGlobals = Object.freeze([
  "BigInt",
  "DisposableStack",
  "AsyncDisposableStack",
  "SuppressedError",
] as const);

/**
 * The fixed prelude, run as its own `evalCode` before the script and never
 * joined to it (condition 1). It replaces each path to the compiler with
 * one frozen thrower, non-writable and non-configurable, and freezes the
 * thrower and `Function.prototype`. It also pins `Error.prepareStackTrace`
 * to `undefined`: QuickJS-ng calls it for every error the engine makes,
 * including errors from the host's own calls after the script has stopped,
 * so a script's hook would run outside the script's time. It deletes the
 * {@link removedGlobals}, and the `constructor` backlinks through which a
 * bigint literal or a failed `using` dispose would still hand a script
 * `BigInt` or `SuppressedError`. It returns the thrower, the four function
 * prototypes, `Error` and those two prototypes so the host can check every
 * slot.
 */
export const preludeSource = `(() => {
  "use strict";
  const thrower = function () {
    throw new TypeError("eval and Function are not available in a ToolScript");
  };
  const define = Object.defineProperty;
  const getPrototypeOf = Object.getPrototypeOf;
  const functionPrototype = Function.prototype;
  const asyncFunctionPrototype = getPrototypeOf(async function () {});
  const generatorFunctionPrototype = getPrototypeOf(function* () {});
  const asyncGeneratorFunctionPrototype = getPrototypeOf(async function* () {});
  define(thrower, "prototype", { value: functionPrototype, writable: false });
  const slot = { value: thrower, writable: false, enumerable: false, configurable: false };
  define(globalThis, "eval", slot);
  define(globalThis, "Function", slot);
  for (const prototype of [
    functionPrototype,
    asyncFunctionPrototype,
    generatorFunctionPrototype,
    asyncGeneratorFunctionPrototype,
  ]) {
    define(prototype, "constructor", slot);
  }
  define(Error, "prepareStackTrace", {
    value: undefined,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  const bigIntPrototype = getPrototypeOf(0n);
  const suppressedErrorPrototype = SuppressedError.prototype;
  delete bigIntPrototype.constructor;
  delete suppressedErrorPrototype.constructor;
  for (const name of ${JSON.stringify(removedGlobals)}) delete globalThis[name];
  Object.freeze(thrower);
  Object.freeze(functionPrototype);
  return Object.freeze({
    thrower,
    errorConstructor: Error,
    bigIntPrototype,
    suppressedErrorPrototype,
    functionPrototype,
    asyncFunctionPrototype,
    generatorFunctionPrototype,
    asyncGeneratorFunctionPrototype,
  });
})()`;

/** Each slot the prelude replaces: the object (a global or a prelude result field) and the key. */
export const preludeSlots = [
  ["globalThis", "eval"],
  ["globalThis", "Function"],
  ["functionPrototype", "constructor"],
  ["asyncFunctionPrototype", "constructor"],
  ["generatorFunctionPrototype", "constructor"],
  ["asyncGeneratorFunctionPrototype", "constructor"],
] as const;

/** Whether one slot holds `expected` as a non-writable, non-configurable data property. */
function slotHolds(
  vm: QuickJSContext,
  builtins: Builtins,
  owner: QuickJSHandle,
  key: string,
  expected: QuickJSHandle,
): boolean {
  const keyHandle = vm.newString(key);
  const descriptor = callBuiltin(vm, builtins.getOwnPropertyDescriptor, owner, keyHandle);
  keyHandle.dispose();
  if (descriptor === undefined || vm.typeof(descriptor) !== "object") {
    descriptor?.dispose();
    return false;
  }
  // Read only own data fields of the descriptor: a getter on Object.prototype
  // must never run, even after the script polluted it.
  const value = ownDataField(vm, builtins, descriptor, "value");
  const writable = ownDataField(vm, builtins, descriptor, "writable");
  const configurable = ownDataField(vm, builtins, descriptor, "configurable");
  const holds =
    value !== undefined &&
    same(vm, builtins, value, expected) &&
    writable !== undefined &&
    !isTrue(vm, writable) &&
    configurable !== undefined &&
    !isTrue(vm, configurable);
  for (const handle of [value, writable, configurable, descriptor]) handle?.dispose();
  return holds;
}

/** Whether `object` is frozen, asked through the captured `Object.isFrozen`. */
function isFrozen(vm: QuickJSContext, builtins: Builtins, object: QuickJSHandle): boolean {
  const result = callBuiltin(vm, builtins.isFrozen, object);
  const frozen = isTrue(vm, result);
  result?.dispose();
  return frozen;
}

/**
 * The host's own check of the prelude (condition 3): every slot holds the
 * one thrower, non-writable and non-configurable, and the thrower and
 * `Function.prototype` are frozen, and `Error.prepareStackTrace` is pinned to
 * `undefined`. Read through the QuickJS API with
 * built-ins captured before any script ran, so a library bump that changes
 * the intrinsics fails closed. Run before the script and again after it.
 */
export function preludeHolds(
  vm: QuickJSContext,
  builtins: Builtins,
  preludeResult: QuickJSHandle,
): boolean {
  const thrower = ownDataField(vm, builtins, preludeResult, "thrower");
  if (thrower === undefined || vm.typeof(thrower) !== "function") {
    thrower?.dispose();
    return false;
  }
  const holds =
    isFrozen(vm, builtins, thrower) &&
    isFrozen(vm, builtins, preludeResult) &&
    preludeSlots.every(([ownerName, key]) =>
      throwerSlotHolds(vm, builtins, preludeResult, ownerName, key, thrower),
    );
  thrower.dispose();
  return holds && stackHookPinned(vm, builtins, preludeResult);
}

/** One of {@link preludeSlots}; `Function.prototype` must also be frozen. */
function throwerSlotHolds(
  vm: QuickJSContext,
  builtins: Builtins,
  preludeResult: QuickJSHandle,
  ownerName: (typeof preludeSlots)[number][0],
  key: string,
  thrower: QuickJSHandle,
): boolean {
  if (ownerName === "globalThis") return slotHolds(vm, builtins, vm.global, key, thrower);
  const owner = ownDataField(vm, builtins, preludeResult, ownerName);
  if (owner === undefined) return false;
  const holds =
    slotHolds(vm, builtins, owner, key, thrower) &&
    (ownerName !== "functionPrototype" || isFrozen(vm, builtins, owner));
  owner.dispose();
  return holds;
}

/** Whether `Error.prepareStackTrace` is a non-writable, non-configurable `undefined`. */
function stackHookPinned(
  vm: QuickJSContext,
  builtins: Builtins,
  preludeResult: QuickJSHandle,
): boolean {
  const errorConstructor = ownDataField(vm, builtins, preludeResult, "errorConstructor");
  if (errorConstructor === undefined) return false;
  const pinned = slotHolds(vm, builtins, errorConstructor, "prepareStackTrace", vm.undefined);
  errorConstructor.dispose();
  return pinned;
}

/** Whether `owner` has no own property `key`, asked through the captured `getOwnPropertyDescriptor`. */
function hasNoOwn(
  vm: QuickJSContext,
  builtins: Builtins,
  owner: QuickJSHandle,
  key: string,
): boolean {
  const keyHandle = vm.newString(key);
  const descriptor = callBuiltin(vm, builtins.getOwnPropertyDescriptor, owner, keyHandle);
  keyHandle.dispose();
  const absent = descriptor !== undefined && vm.typeof(descriptor) === "undefined";
  descriptor?.dispose();
  return absent;
}

/**
 * The host's check that the {@link removedGlobals} and the two `constructor`
 * backlinks are gone before the script starts. Only before: a script that
 * later names a global `BigInt` itself can only store values it already had.
 */
export function removedGlobalsAbsent(
  vm: QuickJSContext,
  builtins: Builtins,
  preludeResult: QuickJSHandle,
): boolean {
  if (!removedGlobals.every((name) => hasNoOwn(vm, builtins, vm.global, name))) return false;
  return ["bigIntPrototype", "suppressedErrorPrototype"].every((field) => {
    const prototype = ownDataField(vm, builtins, preludeResult, field);
    if (prototype === undefined) return false;
    const absent = hasNoOwn(vm, builtins, prototype, "constructor");
    prototype.dispose();
    return absent;
  });
}
