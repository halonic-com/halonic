import type { ToolScriptIsolateRequest, ToolScriptLimits } from "@halonicjs/ports";
import { failedRun, utf8Bytes } from "./worker-messages.ts";

/**
 * Why the parent refuses `request` before a worker starts, or `undefined`
 * to run it. Its input goes to the worker as JSON text, so it must be plain
 * data: JSON's own values, in arrays and objects with the plain prototype,
 * with no cycle. A secret handle isn't: this isolate takes no host functions,
 * so a handle could never be used, and its reference must not reach the
 * worker as text.
 */
export function refusalOf(
  request: ToolScriptIsolateRequest,
  limits: ToolScriptLimits,
): ReturnType<typeof failedRun> | undefined {
  if (request.signal?.aborted) return failedRun("toolscript.cancelled", limits);
  if (Object.keys(request.functions).length > 0) {
    return failedRun("toolscript.failed", limits, "This isolate takes no host functions.");
  }
  if (!isPlainData(request.input, new Set())) {
    return { ok: false, reason: "toolscript.bad-input", log: [], limits };
  }
  if (utf8Bytes(JSON.stringify(request.input)) > limits.inputBytes) {
    return { ok: false, reason: "limit.input", log: [], limits };
  }
  return undefined;
}

/** Whether `value` is plain data; `path` holds the objects around it, to find a cycle. */
function isPlainData(value: unknown, path: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || path.has(value)) return false;
  if (!hasPlainPrototype(value) || Object.getOwnPropertySymbols(value).length > 0) return false;
  path.add(value);
  const plain = Object.values(value).every((item) => isPlainData(item, path));
  path.delete(value);
  return plain;
}

function hasPlainPrototype(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (Array.isArray(value)) return prototype === Array.prototype;
  return prototype === Object.prototype || prototype === null;
}
