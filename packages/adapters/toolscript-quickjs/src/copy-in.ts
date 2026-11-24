import { isToolScriptSecretHandle, type ToolScriptIsolateValue } from "@halonicjs/ports";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { type Builtins, callBuiltin } from "./builtins.ts";
import type { HandleTable } from "./handles.ts";

/**
 * Builds a frozen copy of host data inside the isolate: the input and each
 * host function's result. A secret handle becomes this run's id for it, so
 * the secret's reference never enters the isolate (ADR S7). Throws a
 * `TypeError` for a value that isn't plain data, such as a function.
 */
export function copyIn(
  vm: QuickJSContext,
  builtins: Builtins,
  table: HandleTable,
  value: ToolScriptIsolateValue,
): QuickJSHandle {
  if (value === null) return vm.null;
  if (isToolScriptSecretHandle(value)) return vm.newString(table.idFor(value));
  switch (typeof value) {
    case "boolean":
      return value ? vm.true : vm.false;
    case "number":
      if (!Number.isFinite(value))
        throw new TypeError("a ToolScript value can't be NaN or infinite");
      return vm.newNumber(value);
    case "string":
      return vm.newString(value);
    case "object":
      return frozen(
        vm,
        builtins,
        isList(value) ? array(vm, builtins, table, value) : record(vm, builtins, table, value),
      );
    default:
      throw new TypeError(`a ToolScript value can't be a ${typeof value}`);
  }
}

function isList(
  value: readonly ToolScriptIsolateValue[] | { readonly [key: string]: ToolScriptIsolateValue },
): value is readonly ToolScriptIsolateValue[] {
  return Array.isArray(value);
}

function array(
  vm: QuickJSContext,
  builtins: Builtins,
  table: HandleTable,
  items: readonly ToolScriptIsolateValue[],
): QuickJSHandle {
  const handle = vm.newArray();
  items.forEach((item, index) => {
    const itemHandle = copyIn(vm, builtins, table, item);
    define(vm, handle, index, itemHandle);
    itemHandle.dispose();
  });
  return handle;
}

function record(
  vm: QuickJSContext,
  builtins: Builtins,
  table: HandleTable,
  fields: { readonly [key: string]: ToolScriptIsolateValue },
): QuickJSHandle {
  if (
    Object.getPrototypeOf(fields) !== Object.prototype &&
    Object.getPrototypeOf(fields) !== null
  ) {
    throw new TypeError("a ToolScript value can only hold plain objects");
  }
  const handle = vm.newObject();
  for (const [key, field] of Object.entries(fields)) {
    const fieldHandle = copyIn(vm, builtins, table, field);
    define(vm, handle, key, fieldHandle);
    fieldHandle.dispose();
  }
  return handle;
}

/**
 * Defines an own data property. Never `setProp`: a plain set would call a
 * setter the script put on `Object.prototype` or `Array.prototype`.
 */
function define(
  vm: QuickJSContext,
  owner: QuickJSHandle,
  key: string | number,
  value: QuickJSHandle,
): void {
  vm.defineProp(owner, key, { value, enumerable: true, configurable: true });
}

/** Freezes `handle` with the captured `Object.freeze` and gives it back. */
function frozen(vm: QuickJSContext, builtins: Builtins, handle: QuickJSHandle): QuickJSHandle {
  callBuiltin(vm, builtins.freeze, handle)?.dispose();
  return handle;
}
