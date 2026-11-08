// Checks a tool call the model asked for before the host runs it, as
// `ports.untrusted-tool-listings` asks: arguments outside the parameters the
// model was offered are refused, and every risk above `read` needs a
// person's OK.

import { escapeListedText, isJsonObject } from "./listed-tool-rules.ts";
import type { OfferedTool } from "./tool-listing.ts";

/** What the host does with one tool call. */
export type ToolCallCheck =
  /** Run it now. */
  | { readonly kind: "run" }
  /** Ask a person first (`approval.requested`), and run it only once they approve. */
  | { readonly kind: "ask" }
  /** Don't run it. The reason goes back to the model as the call's result. */
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Checks a call to an offered tool. A call with an argument the tool's
 * parameters don't name is refused, so a server can't add a parameter to a
 * declared tool and get it filled in. A tool whose risk isn't `read` needs
 * approval: a listed tool is `write` unless a trusted workspace set a lower
 * risk when the listing was read.
 *
 * Only the top level of the arguments is checked. Extra names are allowed
 * only when the parameters set `additionalProperties` to `true` or to a
 * schema; leaving it out doesn't allow them. When the parameters use `$ref`,
 * `anyOf`, `oneOf` or `allOf` at the top, the names they declare can't be
 * read here yet, so a call with a name outside `properties` is refused as
 * one whose parameters can't be checked.
 *
 * The refusal names the first 8 argument names that were refused, each cut
 * to 64 characters and escaped, and counts the rest. A model steered by a
 * hostile listing may have written them, so they get the same escaping as
 * listed text before the refusal goes back to the model or into a transcript.
 *
 * @param args - the arguments the model sent, unchecked
 *
 * @example
 * const check = checkToolCall(offered, call.arguments);
 * if (check.kind === "refused") return { role: "tool", content: check.reason, … };
 */
export function checkToolCall(tool: OfferedTool, args: unknown): ToolCallCheck {
  if (!isJsonObject(args)) {
    return { kind: "refused", reason: "the arguments aren't an object" };
  }
  const undeclared = undeclaredArguments(tool.parameters, args);
  if (undeclared.length > 0) {
    const names = listNames(undeclared);
    const reason = usesCombinedSchema(tool.parameters)
      ? `${tool.name}'s parameters can't be checked, so ${names} can't be sent`
      : `${tool.name} has no parameter ${names}`;
    return { kind: "refused", reason };
  }
  return tool.risk === "read" ? { kind: "run" } : { kind: "ask" };
}

/** The most argument names one refusal lists; the rest are only counted. */
const maxListedNames = 8;

/**
 * Keywords a rebuilt listing keeps that can declare names outside the top
 * level's `properties`. This check doesn't follow them yet.
 */
const combiningKeywords = ["$ref", "anyOf", "oneOf", "allOf"];

function usesCombinedSchema(parameters: Record<string, unknown>): boolean {
  return combiningKeywords.some((keyword) => Object.hasOwn(parameters, keyword));
}

/** Quotes and escapes the first few names, then says how many more there are. */
function listNames(names: string[]): string {
  const listed = names
    .slice(0, maxListedNames)
    .map((name) => `"${escapeListedText(name)}"`)
    .join(", ");
  const rest = names.length - maxListedNames;
  return rest > 0 ? `${listed} and ${rest} more` : listed;
}

function undeclaredArguments(
  parameters: Record<string, unknown>,
  args: Record<string, unknown>,
): string[] {
  const extra = parameters["additionalProperties"];
  if (extra === true || isJsonObject(extra)) {
    return [];
  }
  const properties = parameters["properties"];
  const declared = isJsonObject(properties) ? properties : {};
  return Object.keys(args).filter((name) => !Object.hasOwn(declared, name));
}
