// Turns an offered tool into what the model sees, and fences its results, as
// `ports.untrusted-tool-listings` asks. Every text a server wrote goes inside
// the untrusted fence here, on its way to the model, and nowhere else.

import type { ToolDefinition } from "@halonicjs/ports";
import { isJsonObject, UntrustedText } from "./listed-tool-rules.ts";
import type { OfferedTool } from "./tool-listing.ts";
import { fenceUntrusted } from "./untrusted-fence.ts";

/**
 * The tool definition the model gets for an offered tool. A declared tool
 * goes as Halonic reviewed it. A listed tool's description, and every
 * `description` and `title` in its parameters, go inside the untrusted
 * fence; its name, property names and `enum` strings stay as they are,
 * because the model sends them back in calls.
 *
 * @example
 * const { tools } = readToolListing(input);
 * const request: ChatRequest = { model, messages, tools: tools.map(toolForModel) };
 */
export function toolForModel(tool: OfferedTool): ToolDefinition {
  if (tool.kind === "declared") {
    return { name: tool.name, description: tool.description, parameters: tool.parameters };
  }
  return {
    name: tool.name,
    description: fenceUntrusted(tool.description.text),
    parameters: fenceSchemaTexts(tool.parameters),
  };
}

/**
 * The text the model gets for a tool's result. A tool whose results are
 * untrusted, and that includes every listed tool whatever it said, gets its
 * result inside the untrusted fence.
 *
 * @param result - what the tool's `callTool` returned
 */
export function toolResultForModel(tool: OfferedTool, result: string): string {
  return tool.untrusted ? fenceUntrusted(result) : result;
}

/**
 * Copies rebuilt parameters with every {@link UntrustedText} fenced. The
 * rebuild leaves only JSON values and untrusted texts, and nests at most 64
 * levels, so the walk can't run out of stack.
 */
function fenceSchemaTexts(parameters: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    copy[key] = fenceValueTexts(value);
  }
  return copy;
}

function fenceValueTexts(value: unknown): unknown {
  if (value instanceof UntrustedText) {
    return fenceUntrusted(value.text);
  }
  if (Array.isArray(value)) {
    return value.map(fenceValueTexts);
  }
  if (isJsonObject(value)) {
    return fenceSchemaTexts(value);
  }
  return value;
}
