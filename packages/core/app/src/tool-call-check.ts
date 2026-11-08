// Checks a tool call the model asked for before the host runs it, as
// `ports.untrusted-tool-listings` asks: arguments outside the parameters the
// model was offered are refused, and every risk above `read` needs a
// person's OK.

import { cutName, isJsonObject } from "./listed-tool-rules.ts";
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
 * schema; leaving it out doesn't allow them.
 *
 * The refusal names only the argument names that were refused, cut to 64
 * characters. The model wrote them, so the refusal can go back to it.
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
    const names = undeclared.map((name) => `"${cutName(name)}"`).join(", ");
    return { kind: "refused", reason: `${tool.name} has no parameter ${names}` };
  }
  return tool.risk === "read" ? { kind: "run" } : { kind: "ask" };
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
