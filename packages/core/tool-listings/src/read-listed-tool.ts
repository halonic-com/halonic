import { isJsonObject } from "./json.ts";
import { maxParametersBytes, maxTextLength, maxUnfencedLength } from "./limits.ts";
import type { ListedSchema } from "./listed-schema.ts";
import { passesNameRule } from "./names.ts";
import { rebuildParameters } from "./rebuild-parameters.ts";
import { unfencedLength } from "./unfenced-length.ts";
import { UntrustedText } from "./untrusted-text.ts";

/**
 * A tool that a server listed and nothing Halonic reviewed declares, read
 * the way requirement `ports.untrusted-tool-listings` says. Its texts are
 * {@link UntrustedText}: tool assembly fences them. Its own `risk` and
 * `untrusted` are ignored.
 */
export interface ListedTool {
  readonly kind: "listed";
  /** The id of the source that listed it: the integration's name or the connector's id. */
  readonly source: string;
  /** Its name, which passes the name rule and clashes with no other tool. */
  readonly name: string;
  readonly description: UntrustedText;
  /** Its parameters, rebuilt from the allow-list. */
  readonly parameters: ListedSchema;
  /** Always `write`; only the workspace can set a lower one. */
  readonly risk: "write";
  /** Always `true`: its results are fenced too. */
  readonly untrusted: true;
}

/** What {@link readListedTool} returns: the tool and what its rebuild dropped, or why it is refused. */
export type ListedToolOutcome =
  | { ok: true; tool: ListedTool; dropped: string[] }
  | { ok: false; reason: string };

/**
 * Reads one listed tool whose name is already checked for clashes. The order
 * of the checks only decides which reason a refused tool gets.
 *
 * @param source - the id of the source that listed it
 * @param name - its name, checked against the name rule here
 * @param listed - the tool as the server sent it
 */
export function readListedTool(
  source: string,
  name: string,
  listed: Record<string, unknown>,
): ListedToolOutcome {
  if (!passesNameRule(name)) {
    return refused("its name breaks the name rule: 1 to 64 letters, digits, `_` or `-`");
  }
  const description = listed["description"] ?? "";
  if (typeof description !== "string") {
    return refused("its description isn't a string");
  }
  if (description.length > maxTextLength) {
    return refused(`its description is more than ${maxTextLength} characters`);
  }
  // The rebuild checks the nesting depth first, so measuring the size after
  // it can't overflow the stack.
  const rebuilt = rebuildParameters(listed["parameters"]);
  if (!rebuilt.ok) {
    return refused(rebuilt.reason);
  }
  const bytes = jsonBytes(listed["parameters"]);
  if (bytes === undefined) {
    return refused("its parameters can't be written as JSON");
  }
  if (bytes > maxParametersBytes) {
    return refused(`its parameters are more than ${maxParametersBytes / 1024} KiB as JSON`);
  }
  const unfenced = name.length + unfencedLength(rebuilt.parameters);
  if (unfenced > maxUnfencedLength) {
    return refused(
      `its name, property names, \`required\` strings, \`$defs\` names and \`enum\`/\`const\` strings add up to ${unfenced} characters, more than ${maxUnfencedLength}`,
    );
  }
  const tool: ListedTool = {
    kind: "listed",
    source,
    name,
    description: new UntrustedText(description),
    parameters: rebuilt.parameters,
    risk: "write",
    untrusted: true,
  };
  return { ok: true, tool, dropped: rebuilt.dropped };
}

/** Whether `value` is a listed tool's outer shape: an object, with a name that is a string. */
export function hasStringName(value: unknown): value is Record<string, unknown> & { name: string } {
  return isJsonObject(value) && typeof value["name"] === "string";
}

function refused(reason: string): ListedToolOutcome {
  return { ok: false, reason };
}

/**
 * The size of `value` as UTF-8 JSON, in bytes, or `undefined` when it holds
 * something JSON can't write, such as a `bigint`. `value` is an object the
 * rebuild already accepted, so it isn't cyclic or too deep.
 */
function jsonBytes(value: unknown): number | undefined {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
  let bytes = 0;
  for (const character of json) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x80) {
      bytes += 1;
    } else if (codePoint < 0x800) {
      bytes += 2;
    } else if (codePoint < 0x10000) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}
