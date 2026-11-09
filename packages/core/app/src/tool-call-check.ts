// Checks a tool call the model asked for before the host runs it, as
// `ports.untrusted-tool-listings` asks: arguments outside the parameters the
// model was offered are refused, and every risk above `read` needs a
// person's OK.

import { escapeListedText, isJsonObject, maxParametersDepth } from "./listed-tool-rules.ts";
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
 * approval: a listed tool is `write` unless a trusted workspace set another
 * risk for it when the listing was read.
 *
 * Extra names are allowed only when the parameters set
 * `additionalProperties` to `true` or to a schema; leaving it out doesn't
 * allow them. The check reads through `$ref` (to `#`, `#/$defs/<name>` or
 * `#/definitions/<name>`) and `allOf`, so a name any part declares is
 * declared. A name whose schema is `false` in any part is forbidden, so it
 * is refused as undeclared even where extra names are allowed. When a part
 * uses `anyOf` or `oneOf`, or a `$ref` it can't follow, a name outside the
 * declared ones is refused as one whose parameters can't be checked.
 *
 * For a declared tool, every nested object and array item with a schema is
 * checked the same way, down to {@link maxParametersDepth} levels. A value
 * whose schema is `true` or `false` isn't looked into. A listed tool's
 * arguments are checked only at the top level, because its server wrote the
 * parameters as well.
 *
 * The refusal names the first 8 arguments that were refused, as a path such
 * as `options.colours[0].hue` cut to 64 characters and escaped, and counts
 * the rest. A model steered by a hostile listing may have written them, so
 * they get the same escaping as listed text before the refusal goes back to
 * the model or into a transcript.
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
  const checker = new ArgumentChecker(tool.parameters, tool.kind === "declared");
  checker.checkObject([tool.parameters], args, [], 0);

  const problems: string[] = [];
  if (checker.tooDeep) {
    problems.push(`${tool.name}'s arguments nest more than ${maxParametersDepth} levels deep`);
  }
  if (checker.undeclared.count > 0) {
    problems.push(`${tool.name} has no parameter ${checker.undeclared.describe()}`);
  }
  if (checker.unchecked.count > 0) {
    const names = checker.unchecked.describe();
    problems.push(`${tool.name}'s parameters can't be checked, so ${names} can't be sent`);
  }
  if (problems.length > 0) {
    return { kind: "refused", reason: problems.join("; ") };
  }
  return tool.risk === "read" ? { kind: "run" } : { kind: "ask" };
}

/** The most argument names one list in a refusal names; the rest are only counted. */
const maxListedNames = 8;

/** A JSON Schema object. `true` and `false` schemas are left out before a level is read. */
type SchemaObject = Record<string, unknown>;

/** Where an argument sits: names of object members and indexes of array items. */
type ArgumentPath = ReadonlyArray<string | number>;

/**
 * The refused arguments of one kind. Only the first few paths are kept and
 * written out; the rest are counted, so a call with many extra names
 * doesn't build a long refusal.
 */
class RefusedArguments {
  private readonly listed: string[] = [];
  count = 0;

  add(path: ArgumentPath): void {
    this.count += 1;
    if (this.listed.length < maxListedNames) {
      this.listed.push(`"${escapeListedText(pathLabel(path))}"`);
    }
  }

  /** The quoted paths, then how many more there are. */
  describe(): string {
    const listed = this.listed.join(", ");
    const rest = this.count - this.listed.length;
    return rest > 0 ? `${listed} and ${rest} more` : listed;
  }
}

/** `options.colours[0].hue`; a top-level argument is just its name. */
function pathLabel(path: ArgumentPath): string {
  let label = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      label += `[${segment}]`;
    } else {
      label += label === "" ? segment : `.${segment}`;
    }
  }
  return label;
}

/**
 * One level of the parameters, read through `$ref` and `allOf`: every part
 * applies to the same value.
 */
interface SchemaLevel {
  readonly parts: readonly SchemaObject[];
  /** Whether a part uses `anyOf`, `oneOf` or a `$ref` the check can't follow. */
  readonly unreadable: boolean;
}

/** Stands for a `$ref` that can't be followed. */
const unfollowable = Symbol("unfollowable");

/** Walks one call's arguments next to the tool's parameters, and collects what it refuses. */
class ArgumentChecker {
  readonly undeclared = new RefusedArguments();
  readonly unchecked = new RefusedArguments();
  tooDeep = false;
  /** The tool's parameters, which `$ref` values point into. */
  private readonly root: SchemaObject;
  /** Whether to look into the values of declared names, or only at the top. */
  private readonly nested: boolean;

  constructor(root: SchemaObject, nested: boolean) {
    this.root = root;
    this.nested = nested;
  }

  /** Checks an object's names against the schemas that apply to it, then looks into their values. */
  checkObject(
    schemas: readonly SchemaObject[],
    value: Record<string, unknown>,
    path: ArgumentPath,
    depth: number,
  ): void {
    const level = this.readLevel(schemas);
    const extra = extraSchemas(level.parts);
    for (const [name, member] of Object.entries(value)) {
      const memberPath = [...path, name];
      const declared = propertySchemas(level.parts, name);
      if (declared?.includes(false)) {
        // `properties: { name: false }` forbids the name, whatever else allows it.
        this.undeclared.add(memberPath);
      } else if (declared !== undefined) {
        this.checkValue(declared, member, memberPath, depth + 1);
      } else if (extra !== undefined) {
        this.checkValue(extra, member, memberPath, depth + 1);
      } else if (level.unreadable) {
        this.unchecked.add(memberPath);
      } else {
        this.undeclared.add(memberPath);
      }
    }
  }

  /** Looks into a nested object or array, when this call checks nested values. */
  private checkValue(
    schemas: readonly unknown[],
    value: unknown,
    path: ArgumentPath,
    depth: number,
  ): void {
    const objects = schemas.filter(isJsonObject);
    if (!this.nested || objects.length === 0 || this.tooDeep) {
      return;
    }
    if (depth > maxParametersDepth) {
      this.tooDeep = true;
      return;
    }
    if (isJsonObject(value)) {
      this.checkObject(objects, value, path, depth);
    } else if (Array.isArray(value)) {
      const level = this.readLevel(objects);
      value.forEach((item, index) => {
        this.checkValue(itemSchemas(level.parts, index), item, [...path, index], depth + 1);
      });
    }
  }

  /** Gathers the parts of a level, following `$ref` and `allOf`. Each `$ref` is followed once. */
  private readLevel(schemas: readonly SchemaObject[]): {
    parts: SchemaObject[];
    unreadable: boolean;
  } {
    const level = { parts: [] as SchemaObject[], unreadable: false };
    const followed = new Set<string>();
    const gather = (schema: SchemaObject): void => {
      level.parts.push(schema);
      if (Object.hasOwn(schema, "anyOf") || Object.hasOwn(schema, "oneOf")) {
        level.unreadable = true;
      }
      const target = this.followRef(schema["$ref"], followed);
      if (target === unfollowable) {
        level.unreadable = true;
      } else if (target !== undefined) {
        gather(target);
      }
      const allOf = schema["allOf"];
      if (Array.isArray(allOf)) {
        allOf.filter(isJsonObject).forEach(gather);
      } else if (allOf !== undefined) {
        level.unreadable = true;
      }
    };
    schemas.forEach(gather);
    return level;
  }

  /**
   * The schema object a `$ref` points to, `undefined` when there is nothing
   * to gather (no `$ref`, one already followed, or a target that isn't an
   * object), or {@link unfollowable} when the `$ref` can't be followed.
   */
  private followRef(
    ref: unknown,
    followed: Set<string>,
  ): SchemaObject | typeof unfollowable | undefined {
    if (typeof ref !== "string") {
      return ref === undefined ? undefined : unfollowable;
    }
    // A `$ref` already followed is part of this level, as in a schema that refers to itself.
    if (followed.has(ref)) {
      return undefined;
    }
    followed.add(ref);
    const target = this.resolve(ref);
    if (target === undefined) {
      return unfollowable;
    }
    return isJsonObject(target) ? target : undefined;
  }

  /** The schema a `$ref` inside the parameters points to, or `undefined` if it can't be followed. */
  private resolve(ref: string): unknown {
    if (ref === "#") {
      return this.root;
    }
    const match = /^#\/(\$defs|definitions)\/([^/]+)$/.exec(ref);
    const [, keyword, segment] = match ?? [];
    if (keyword === undefined || segment === undefined) {
      return undefined;
    }
    const definitions = this.root[keyword];
    const name = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isJsonObject(definitions) || !Object.hasOwn(definitions, name)) {
      return undefined;
    }
    const target = definitions[name];
    return isJsonObject(target) || typeof target === "boolean" ? target : undefined;
  }
}

/** The schemas that every part declaring `name` gives it, or `undefined` if no part declares it. */
function propertySchemas(parts: readonly SchemaObject[], name: string): unknown[] | undefined {
  const schemas: unknown[] = [];
  let declared = false;
  for (const part of parts) {
    const properties = part["properties"];
    if (isJsonObject(properties) && Object.hasOwn(properties, name)) {
      declared = true;
      schemas.push(properties[name]);
    }
  }
  return declared ? schemas : undefined;
}

/**
 * The schemas extra names must match, or `undefined` when extra names
 * aren't allowed: some part has to allow them with `true` or a schema, and
 * no part may forbid them with `false`.
 */
function extraSchemas(parts: readonly SchemaObject[]): unknown[] | undefined {
  const values = parts
    .filter((part) => Object.hasOwn(part, "additionalProperties"))
    .map((part) => part["additionalProperties"]);
  const allowed = values.some((value) => value === true || isJsonObject(value));
  return allowed && !values.includes(false) ? values : undefined;
}

/** The schemas an array item at `index` must match: its `prefixItems` entry, or else `items`. */
function itemSchemas(parts: readonly SchemaObject[], index: number): unknown[] {
  return parts.map((part) => {
    const prefixItems = part["prefixItems"];
    if (Array.isArray(prefixItems) && index < prefixItems.length) {
      return prefixItems[index];
    }
    return part["items"];
  });
}
