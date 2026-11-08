import { ParametersRefused } from "./dropped.ts";
import { isJsonObject, nestsDeeperThan } from "./json.ts";
import { maxParameterDepth } from "./limits.ts";
import type { ListedSchema } from "./listed-schema.ts";
import { ParametersReader } from "./parameters-reader.ts";

/** What {@link rebuildParameters} returns: the rebuilt parameters, or why the tool is refused. */
export type RebuiltParameters =
  | {
      ok: true;
      /** The parameters to offer, with every text an `UntrustedText`. */
      parameters: ListedSchema;
      /** A refusal reason for each keyword or entry the rebuild dropped. */
      dropped: string[];
    }
  | {
      ok: false;
      /** Why the whole tool is refused. Text from the listing in it is cut and escaped. */
      reason: string;
    };

/**
 * Rebuilds a listed tool's `parameters` from the allow-list of requirement
 * `ports.untrusted-tool-listings`. It keeps only the allowed keywords, with
 * the shape JSON Schema defines, reads a root `definitions` as `$defs`, and
 * turns every `description` and `title` into an `UntrustedText`.
 *
 * It refuses the tool when the parameters aren't an object or nest more than
 * {@link maxParameterDepth} deep, when a name the model sends back breaks the
 * name rule, when a text is too long, when the root has both `definitions`
 * and `$defs`, or when a `$ref` doesn't name a kept `$defs` entry.
 *
 * @param parameters - the tool's `parameters` as the server sent them
 *
 * @example
 * const rebuilt = rebuildParameters({ type: "object", pattern: "^a", properties: { q: { type: "string" } } });
 * // rebuilt.ok === true; rebuilt.parameters has no `pattern`; rebuilt.dropped has one reason
 */
export function rebuildParameters(parameters: unknown): RebuiltParameters {
  if (!isJsonObject(parameters)) {
    return { ok: false, reason: "its parameters aren't a JSON object" };
  }
  if (nestsDeeperThan(parameters, maxParameterDepth)) {
    return {
      ok: false,
      reason: `its parameters nest objects and arrays more than ${maxParameterDepth} levels deep`,
    };
  }
  const definitionsAtRoot = Object.hasOwn(parameters, "definitions");
  if (definitionsAtRoot && Object.hasOwn(parameters, "$defs")) {
    return { ok: false, reason: "its parameters have both `definitions` and `$defs` at the root" };
  }
  const reader = new ParametersReader(definitionsAtRoot);
  try {
    const rebuilt = reader.readSchema(parameters, "");
    reader.checkRefs(rebuilt);
    return { ok: true, parameters: rebuilt, dropped: reader.dropped };
  } catch (error) {
    if (error instanceof ParametersRefused) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}
