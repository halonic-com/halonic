// Reads one listed tool, a tool a server wrote and nothing Halonic reviewed
// declares (`ports.untrusted-tool-listings`): the size caps, the name rule
// and the allow-list rebuild of its parameters.

import type { ConnectorTool } from "@halonicjs/ports";
import { isJsonObject, passesNameRule, sizeProblem, UntrustedText } from "./listed-tool-rules.ts";
import { RefusedTool, rebuildParameters } from "./listed-tool-schema.ts";

/** A listed tool that can be offered, with its texts marked as untrusted. */
export interface KeptListedTool {
  readonly kind: "kept";
  readonly name: string;
  readonly description: UntrustedText;
  /** Rebuilt from the allow-list. Its `description` and `title` values are {@link UntrustedText}. */
  readonly parameters: Record<string, unknown>;
  /** A JSON pointer to each keyword the rebuild dropped. */
  readonly dropped: readonly string[];
}

/** A listed tool that can't be offered, and why. */
export interface RefusedListedTool {
  readonly kind: "refused";
  /** Says which rule the tool broke. It never repeats the text that broke it. */
  readonly reason: string;
}

/**
 * Applies the size caps, the name rule and the allow-list to one listed
 * tool. Its `risk` and `untrusted` are ignored: a listed tool can't lower
 * its own risk or mark itself trusted.
 *
 * @param tool - as the source returned it; its fields may hold anything
 */
export function readListedTool(tool: ConnectorTool): KeptListedTool | RefusedListedTool {
  // The type says what a well-behaved source returns. A hostile one can
  // return anything, so each field is checked before it is used.
  const { name, description, parameters }: Record<string, unknown> = { ...tool };
  if (!passesNameRule(name)) {
    return refused("its name breaks the name rule");
  }
  if (typeof description !== "string") {
    return refused("its description isn't text");
  }
  if (!isJsonObject(parameters)) {
    return refused("its parameters aren't a JSON object");
  }
  const tooLarge = sizeProblem(description, parameters);
  if (tooLarge !== undefined) {
    return refused(tooLarge);
  }
  try {
    const rebuilt = rebuildParameters(parameters);
    return {
      kind: "kept",
      name,
      description: new UntrustedText(description),
      parameters: rebuilt.parameters,
      dropped: rebuilt.dropped,
    };
  } catch (error) {
    if (error instanceof RefusedTool) {
      return refused(error.message);
    }
    throw error;
  }
}

function refused(reason: string): RefusedListedTool {
  return { kind: "refused", reason };
}
