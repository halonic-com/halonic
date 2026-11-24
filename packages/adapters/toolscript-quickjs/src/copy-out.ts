import type { ToolScriptIsolateValue, ToolScriptReason } from "@halonicjs/ports";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { type Builtins, callBuiltin, isTrue, same } from "./builtins.ts";
import { type HandleTable, handleIdPrefix } from "./handles.ts";
import { hasOwn, ownKeys } from "./own-fields.ts";

/** How one value may leave the isolate. */
export interface CopyOutRules {
  readonly maxDepth: number;
  readonly maxItems: number;
  readonly maxBytes: number;
  /** `resolve`: a known handle id becomes its handle. `refuse`: any handle id stops the copy. */
  readonly handles: "resolve" | "refuse";
  /** The reason for a value that isn't plain data. */
  readonly shapeReason: ToolScriptReason;
  /** The reason for a value over `maxBytes`, `maxItems` or `maxDepth`. */
  readonly sizeReason: ToolScriptReason;
}

/** A copied value, or why it can't leave the isolate. */
export type CopyOutResult =
  | { readonly ok: true; readonly value: ToolScriptIsolateValue }
  | { readonly ok: false; readonly reason: ToolScriptReason };

class Refused extends Error {
  readonly reason: ToolScriptReason;

  constructor(reason: ToolScriptReason) {
    super(reason);
    this.reason = reason;
  }
}

/**
 * Copies a value out of the isolate as frozen plain data (ADR S15). It walks
 * the value with the QuickJS API and built-ins captured before the script
 * ran, and reads each property through its descriptor, never through a
 * getter, so no script code runs: no getter, `toJSON`, `valueOf` or
 * `Symbol.toPrimitive`. Accessors, functions, symbols, other prototypes,
 * holes, non-enumerable keys and non-finite numbers are refused.
 */
export function copyOut(
  vm: QuickJSContext,
  builtins: Builtins,
  table: HandleTable,
  handle: QuickJSHandle,
  rules: CopyOutRules,
): CopyOutResult {
  const walker = new Walker(vm, builtins, table, rules);
  try {
    const value = walker.walk(handle, 0);
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    if (bytes > rules.maxBytes) return { ok: false, reason: rules.sizeReason };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}

class Walker {
  readonly vm: QuickJSContext;
  readonly builtins: Builtins;
  readonly table: HandleTable;
  readonly rules: CopyOutRules;
  #items = 0;
  #bytes = 0;

  constructor(vm: QuickJSContext, builtins: Builtins, table: HandleTable, rules: CopyOutRules) {
    this.vm = vm;
    this.builtins = builtins;
    this.table = table;
    this.rules = rules;
  }

  walk(handle: QuickJSHandle, depth: number): ToolScriptIsolateValue {
    const vm = this.vm;
    switch (vm.typeof(handle)) {
      case "boolean":
        return isTrue(vm, handle);
      case "number":
        return this.number(vm.getNumber(handle));
      case "string":
        return this.string(vm.getString(handle));
      case "object":
        if (same(vm, this.builtins, handle, vm.null)) return null;
        return this.object(handle, depth + 1);
      default:
        // undefined, functions, symbols and anything else isn't plain data.
        throw new Refused(this.rules.shapeReason);
    }
  }

  private number(value: number): number {
    if (!Number.isFinite(value)) throw new Refused(this.rules.shapeReason);
    this.count(String(value).length);
    return value;
  }

  private string(value: string): ToolScriptIsolateValue {
    this.count(value.length);
    if (!value.includes(handleIdPrefix)) return value;
    const handle = this.rules.handles === "resolve" ? this.table.handleFor(value) : undefined;
    if (handle === undefined) throw new Refused("toolscript.bad-handle");
    return handle;
  }

  private count(bytes: number): void {
    // A cheap running estimate, so a huge value stops early; the exact size is checked at the end.
    this.#bytes += bytes;
    if (this.#bytes > this.rules.maxBytes) throw new Refused(this.rules.sizeReason);
  }

  private object(handle: QuickJSHandle, depth: number): ToolScriptIsolateValue {
    if (depth > this.rules.maxDepth) throw new Refused(this.rules.sizeReason);
    const kind = this.kindOf(handle);
    const keys = ownKeys(this.vm, this.builtins, handle);
    if (kind === undefined || keys === undefined || keys.hasSymbols) {
      throw new Refused(this.rules.shapeReason);
    }
    if (kind === "array") return Object.freeze(this.array(handle, keys.strings, depth));
    const copy: Record<string, ToolScriptIsolateValue> = {};
    for (const key of keys.strings) {
      this.item(key.length);
      copy[key] = this.property(handle, key, depth, true);
    }
    return Object.freeze(copy);
  }

  private array(
    handle: QuickJSHandle,
    keys: readonly string[],
    depth: number,
  ): ToolScriptIsolateValue[] {
    const length = this.property(handle, "length", depth, false);
    if (typeof length !== "number" || keys.length !== length + 1) {
      throw new Refused(this.rules.shapeReason);
    }
    const copy: ToolScriptIsolateValue[] = [];
    for (let index = 0; index < length; index += 1) {
      // Every index must be an own key: a hole or an extra key changes the count above.
      if (!keys.includes(String(index))) throw new Refused(this.rules.shapeReason);
      this.item(1);
      copy.push(this.property(handle, String(index), depth, true));
    }
    return copy;
  }

  private item(bytes: number): void {
    this.#items += 1;
    if (this.#items > this.rules.maxItems) throw new Refused(this.rules.sizeReason);
    this.count(bytes);
  }

  /** `array`, `object` (a plain or null-prototype object) or `undefined` for anything else. */
  private kindOf(handle: QuickJSHandle): "array" | "object" | undefined {
    const { vm, builtins } = this;
    const prototype = callBuiltin(vm, builtins.getPrototypeOf, handle);
    if (prototype === undefined) return undefined;
    let kind: "array" | "object" | undefined;
    if (
      same(vm, builtins, prototype, vm.null) ||
      same(vm, builtins, prototype, builtins.objectPrototype)
    ) {
      kind = "object";
    } else if (same(vm, builtins, prototype, builtins.arrayPrototype)) {
      const isArray = callBuiltin(vm, builtins.isArray, handle);
      kind = isTrue(vm, isArray) ? "array" : undefined;
      isArray?.dispose();
    }
    prototype.dispose();
    return kind;
  }

  /** One own data property, read from its descriptor; an accessor or a hidden key is refused. */
  private property(
    owner: QuickJSHandle,
    key: string,
    depth: number,
    mustBeEnumerable: boolean,
  ): ToolScriptIsolateValue {
    const vm = this.vm;
    const keyHandle = vm.newString(key);
    const descriptor = callBuiltin(vm, this.builtins.getOwnPropertyDescriptor, owner, keyHandle);
    keyHandle.dispose();
    if (descriptor === undefined || !hasOwn(vm, this.builtins, descriptor, "value")) {
      descriptor?.dispose();
      throw new Refused(this.rules.shapeReason);
    }
    const enumerable = vm.getProp(descriptor, "enumerable");
    const visible = isTrue(vm, enumerable);
    enumerable.dispose();
    if (mustBeEnumerable && !visible) {
      descriptor.dispose();
      throw new Refused(this.rules.shapeReason);
    }
    const value = vm.getProp(descriptor, "value");
    descriptor.dispose();
    try {
      return this.walk(value, depth);
    } finally {
      value.dispose();
    }
  }
}
