import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { type Builtins, callBuiltin, isTrue } from "./builtins.ts";

/**
 * The own keys of `object`, from the captured `Reflect.ownKeys`. The array it
 * gives is the engine's own, so its indexes and `length` are own data
 * properties and reading them runs no script code. (This QuickJS build's
 * `getOwnPropertyNames` API breaks for good once the heap was full, so the
 * host never uses it.)
 */
export function ownKeys(
  vm: QuickJSContext,
  builtins: Builtins,
  object: QuickJSHandle,
): { readonly strings: readonly string[]; readonly hasSymbols: boolean } | undefined {
  const keys = callBuiltin(vm, builtins.ownKeys, object);
  if (keys === undefined) return undefined;
  const lengthHandle = vm.getProp(keys, "length");
  const length = vm.getNumber(lengthHandle);
  lengthHandle.dispose();
  const strings: string[] = [];
  let hasSymbols = false;
  for (let index = 0; index < length; index += 1) {
    const key = vm.getProp(keys, index);
    if (vm.typeof(key) === "string") strings.push(vm.getString(key));
    else hasSymbols = true;
    key.dispose();
  }
  keys.dispose();
  return { strings, hasSymbols };
}

/** Whether `object` has `key` as an own property, from the captured `Object.hasOwn`. */
export function hasOwn(
  vm: QuickJSContext,
  builtins: Builtins,
  object: QuickJSHandle,
  key: string,
): boolean {
  const keyHandle = vm.newString(key);
  const result = callBuiltin(vm, builtins.hasOwn, object, keyHandle);
  keyHandle.dispose();
  const own = isTrue(vm, result);
  result?.dispose();
  return own;
}

/**
 * Reads one own field of an object the engine or the prelude made, such as
 * a property descriptor, whose own fields are always data properties.
 * `undefined` when the field isn't its own, so a getter a script put on
 * `Object.prototype` is never reached. Never use it on a script's object.
 */
export function ownDataField(
  vm: QuickJSContext,
  builtins: Builtins,
  engineObject: QuickJSHandle,
  key: string,
): QuickJSHandle | undefined {
  return hasOwn(vm, builtins, engineObject, key) ? vm.getProp(engineObject, key) : undefined;
}
