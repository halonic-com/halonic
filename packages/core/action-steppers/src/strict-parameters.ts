import { type Schema, s } from "@halonicjs/schema-kit";
import { assert } from "@halonicjs/std";

/** A text parameter: the whole value must match an anchored pattern and be one safe path segment. */
export interface TextParameter {
  kind: "text";
  /** Anchored with `^` and `$`, such as `/^[A-Za-z0-9-]{1,39}$/`. */
  pattern: RegExp;
  optional?: boolean;
}

/** A parameter that is one of a fixed list of texts. */
export interface ChoiceParameter {
  kind: "choice";
  options: readonly [string, ...string[]];
  optional?: boolean;
}

/** A whole number from `min` to `max`. */
export interface IntegerParameter {
  kind: "integer";
  min: number;
  max: number;
  optional?: boolean;
}

/** How one parameter of a stepper definition is checked. There is no free text, address, body or header. */
export type ParameterField = TextParameter | ChoiceParameter | IntegerParameter;

/**
 * Characters and values a parameter may never hold, whatever its pattern says:
 * each value fills one path segment, so it can't add a segment, a query, a
 * fragment, an escape or another host (architecture note on HAL-17491, 2.2).
 */
const unsafeCharacters = /[/\\?#%@:\s]/;

function isSafeSegment(value: string): boolean {
  return value !== "." && value !== ".." && !unsafeCharacters.test(value);
}

function isAnchored(pattern: RegExp): boolean {
  return pattern.source.startsWith("^") && pattern.source.endsWith("$");
}

/** Only flags that don't change where a match starts or ends; `g` and `y` keep state between tests. */
const allowedFlags = /^[iu]*$/;

/**
 * Anchors the whole pattern, so a top-level alternation such as `^a|b$`
 * can't match `b` anywhere in the value.
 */
function wholeValue(pattern: RegExp): RegExp {
  return new RegExp(`^(?:${pattern.source.slice(1, -1)})$`, pattern.flags);
}

function textSchema(name: string, field: TextParameter): Schema<string> {
  // A definition with an unanchored pattern is a bug in reviewed code, not a bad request.
  assert(
    isAnchored(field.pattern),
    `parameter ${name}: the pattern must start with ^ and end with $`,
  );
  assert(
    allowedFlags.test(field.pattern.flags),
    `parameter ${name}: only the i and u flags are allowed`,
  );
  return s
    .string()
    .regex(wholeValue(field.pattern), `must match ${field.pattern.source}`)
    .refine(isSafeSegment, "must be one path segment: no /, \\, ?, #, %, @, :, spaces, . or ..");
}

function fieldSchema(name: string, field: ParameterField): Schema {
  switch (field.kind) {
    case "text":
      return textSchema(name, field);
    case "choice":
      return s.enum(field.options);
    case "integer":
      return s.number().int().min(field.min).max(field.max);
  }
}

/**
 * A definition's parameter schema with the fields it was built from, so the
 * routes the shell checks take each placeholder's pattern from the same field
 * the page parses with (see `routesOf`).
 */
export type ParameterSchema = Schema<Record<string, string | number>> & {
  readonly parameterFields: Readonly<Record<string, ParameterField>>;
};

/**
 * Builds a stepper definition's parameter schema: strict, so an unknown key is
 * refused, and every text has an anchored pattern and is one safe path
 * segment. Parse with `parse` from `@halonicjs/schema-kit`.
 *
 * @example
 * const parameters = strictParameters({
 *   owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
 *   environment: { kind: "choice", options: ["staging", "release"] },
 * });
 */
export function strictParameters(
  fields: Readonly<Record<string, ParameterField>>,
): ParameterSchema {
  const shape: Record<string, Schema> = {};
  for (const [name, field] of Object.entries(fields)) {
    const schema = fieldSchema(name, field);
    shape[name] = field.optional === true ? schema.optional() : schema;
  }
  const schema = s.object(shape).strict() as Schema<Record<string, string | number>>;
  return Object.assign(schema, { parameterFields: { ...fields } });
}

/** The fields a definition's parameters were built from, or `undefined` when `strictParameters` didn't build them. */
export function parameterFieldsOf(
  parameters: Schema<unknown>,
): Readonly<Record<string, ParameterField>> | undefined {
  return "parameterFields" in parameters
    ? (parameters as ParameterSchema).parameterFields
    : undefined;
}
