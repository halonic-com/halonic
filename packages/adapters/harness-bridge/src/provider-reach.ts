import { decodeUtf8, encodeUtf8, isPlainObject, KindedError } from "@halonicjs/std";

/**
 * The parts of a model request that make the provider reach outside from its
 * own side, where the sandbox's network fence can't see them (decision 7 on
 * HAL-2076: a harness agent reaches outside only through Halonic's tools).
 */
export interface ProviderReach {
  /** True for a server tool, by its `type`, that the provider runs against the web. */
  isRemovedTool(type: string): boolean;
  /** Top-level fields that make the provider call other servers, such as Anthropic's `mcp_servers`. */
  removedFields: readonly string[];
}

/**
 * A model request's body as JSON.
 *
 * @throws KindedError `invalid_input` when the body isn't JSON
 */
export function parseModelRequest(body: Uint8Array): unknown {
  try {
    return JSON.parse(decodeUtf8(body));
  } catch (cause) {
    throw new KindedError("invalid_input", "The model request isn't valid JSON.", { cause });
  }
}

/**
 * Removes the fields and the tools that `reach` names from a model request.
 * The match on a tool is on its `type`, never on its `name`, so a renamed web
 * tool still goes.
 *
 * `request` is `body` already parsed. A request with nothing to remove goes on
 * byte for byte, unchanged.
 */
export function withoutProviderReach(
  body: Uint8Array,
  request: unknown,
  reach: ProviderReach,
): Uint8Array {
  if (!isPlainObject(request)) return body;

  const kept: Record<string, unknown> = { ...request };
  let removed = false;
  for (const field of reach.removedFields) {
    if (Object.hasOwn(kept, field)) {
      delete kept[field];
      removed = true;
    }
  }
  const tools = kept["tools"];
  if (Array.isArray(tools)) {
    const keptTools = tools.filter(
      (tool) => !(isPlainObject(tool) && removedType(tool, reach.isRemovedTool)),
    );
    if (keptTools.length !== tools.length) {
      kept["tools"] = keptTools;
      removed = true;
    }
  }
  return removed ? encodeUtf8(JSON.stringify(kept)) : body;
}

/** True for a tool whose `type` the predicate names. */
function removedType(tool: Record<string, unknown>, isRemoved: (type: string) => boolean): boolean {
  const type = tool["type"];
  return typeof type === "string" && isRemoved(type);
}
