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
 * The fixed prelude, run as its own `evalCode` before the script and never
 * joined to it (condition 1). It replaces each path to the compiler with
 * one frozen thrower, non-writable and non-configurable, and freezes the
 * thrower and `Function.prototype`. It returns the thrower and the four
 * function prototypes so the host can check every slot.
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
  Object.freeze(thrower);
  Object.freeze(functionPrototype);
  return Object.freeze({
    thrower,
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

/** Whether one slot holds the thrower as a non-writable, non-configurable data property. */
function slotHoldsThrower(
  vm: QuickJSContext,
  builtins: Builtins,
  owner: QuickJSHandle,
  key: string,
  thrower: QuickJSHandle,
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
    same(vm, builtins, value, thrower) &&
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
 * `Function.prototype` are frozen. Read through the QuickJS API with
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
  let holds = isFrozen(vm, builtins, thrower) && isFrozen(vm, builtins, preludeResult);
  for (const [ownerName, key] of preludeSlots) {
    if (!holds) break;
    const owner =
      ownerName === "globalThis" ? vm.global : ownDataField(vm, builtins, preludeResult, ownerName);
    holds = owner !== undefined && slotHoldsThrower(vm, builtins, owner, key, thrower);
    if (ownerName === "functionPrototype" && owner !== undefined) {
      holds = holds && isFrozen(vm, builtins, owner);
    }
    if (ownerName !== "globalThis") owner?.dispose();
  }
  thrower.dispose();
  return holds;
}
