import { decodeUtf8, encodeUtf8, isPlainObject, KindedError } from "@halonicjs/std";

/**
 * Removes the tools whose `type` the predicate names from a model request's
 * `tools` list (decision 7 on HAL-2076: a harness agent doesn't get the
 * provider's own web tools in 0.1). They run at the provider, where the
 * sandbox's network fence can't reach them. The match is on `type`, never
 * on `name`, so a renamed web tool still goes.
 *
 * A request with nothing to remove goes on byte for byte, unchanged.
 *
 * @throws KindedError `invalid_input` when the body isn't JSON
 */
export function withoutTools(body: Uint8Array, isRemoved: (type: string) => boolean): Uint8Array {
  const request = parseJson(body);
  if (!isPlainObject(request) || !Array.isArray(request["tools"])) return body;

  const tools: unknown[] = request["tools"];
  const kept = tools.filter((tool) => !(isPlainObject(tool) && removedType(tool, isRemoved)));
  if (kept.length === tools.length) return body;
  return encodeUtf8(JSON.stringify({ ...request, tools: kept }));
}

/** True for a tool whose `type` the predicate names. */
function removedType(tool: Record<string, unknown>, isRemoved: (type: string) => boolean): boolean {
  const type = tool["type"];
  return typeof type === "string" && isRemoved(type);
}

function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(decodeUtf8(body));
  } catch (cause) {
    throw new KindedError("invalid_input", "The model request isn't valid JSON.", { cause });
  }
}
