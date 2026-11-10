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
  /**
   * The request's `tool_choice` once the removed tools are gone. A choice
   * that forces a removed tool becomes `auto`, because the provider answers
   * 400 to a choice naming a tool the request doesn't have. So does a choice
   * that forces some tool when the bridge removed every tool, because the
   * provider answers 400 to a forced tool use with no tools. Any other choice
   * comes back as the same value.
   */
  keptToolChoice(choice: unknown, tools: ToolsAfterRemoval): unknown;
}

/** A request's tools, split into the ones the bridge removed and the ones it kept. */
export interface ToolsAfterRemoval {
  removed: readonly Record<string, unknown>[];
  kept: readonly unknown[];
}

/**
 * True when the request had tools and the bridge removed every one of them.
 * A request that came without tools isn't one: its `tool_choice` is the
 * program's own to get right.
 */
export function removedEveryTool(tools: ToolsAfterRemoval): boolean {
  return tools.removed.length > 0 && tools.kept.length === 0;
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
 * tool still goes. A `tool_choice` that forces a removed tool, or forces some
 * tool when none is left, is set back to `auto` by `reach.keptToolChoice`.
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
  const tools = splitTools(kept["tools"], reach);
  if (tools.removed.length > 0) {
    kept["tools"] = tools.kept;
    removed = true;
  }
  if (Object.hasOwn(kept, "tool_choice")) {
    const choice = reach.keptToolChoice(kept["tool_choice"], tools);
    if (choice !== kept["tool_choice"]) {
      kept["tool_choice"] = choice;
      removed = true;
    }
  }
  return removed ? encodeUtf8(JSON.stringify(kept)) : body;
}

/** Splits a request's `tools` by whether `reach` removes them. Anything but a list has no tools. */
function splitTools(tools: unknown, reach: ProviderReach): ToolsAfterRemoval {
  const split: { removed: Record<string, unknown>[]; kept: unknown[] } = { removed: [], kept: [] };
  if (!Array.isArray(tools)) return split;
  for (const tool of tools) {
    if (isPlainObject(tool) && hasRemovedType(tool, reach.isRemovedTool)) {
      split.removed.push(tool);
    } else {
      split.kept.push(tool);
    }
  }
  return split;
}

/** True for a tool, or a tool choice, whose `type` the predicate names. */
export function hasRemovedType(
  tool: Record<string, unknown>,
  isRemoved: (type: string) => boolean,
): boolean {
  const type = tool["type"];
  return typeof type === "string" && isRemoved(type);
}
