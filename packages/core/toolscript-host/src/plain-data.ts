import {
  isToolScriptSecretHandle,
  type ToolScriptData,
  type ToolScriptIsolateValue,
} from "@halonicjs/ports";

/**
 * Freezes a value and everything inside it, in place, and returns it. The
 * isolate already hands host functions a fresh plain copy (S15); freezing it
 * here makes sure nothing, the host's own code included, changes it between
 * the preview and the send (S9).
 */
export function deepFreeze<Value extends ToolScriptIsolateValue>(value: Value): Value {
  if (typeof value !== "object" || value === null || isToolScriptSecretHandle(value)) return value;
  for (const inner of Object.values(value)) deepFreeze(inner as ToolScriptIsolateValue);
  return Object.freeze(value);
}

/**
 * A deep-frozen copy of plain data, so freezing never touches the original
 * (such as the artifact header's own `ui.preview`).
 */
export function frozenCopy<Value extends ToolScriptData>(value: Value): Value {
  return deepFreeze(copyPlain(value) as ToolScriptIsolateValue) as Value;
}

function copyPlain(value: ToolScriptData): ToolScriptData {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(copyPlain);
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlain(inner)]));
}

/**
 * Whether a capability's answer is plain data the script may get back
 * (S6, S16): `null`, booleans, finite numbers, strings, and arrays and
 * objects of those with own data properties and the plain prototypes. A
 * secret handle, a getter, a class instance or a cycle is not.
 */
export function isPlainAnswer(value: unknown, seen: Set<object> = new Set()): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
  seen.add(value);
  const plain = Reflect.ownKeys(value).every((key) => {
    if (typeof key === "symbol") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return false;
    return (Array.isArray(value) && key === "length") || isPlainAnswer(descriptor.value, seen);
  });
  seen.delete(value);
  return plain;
}
