import type {
  ActionBodyField,
  ActionCallRoute,
  ActionRoute,
  ActionSendRequest,
  ActionStepRef,
  ActionValue,
} from "@halonicjs/ports";

/** A body as it reaches the service: the page's fields plus the route's constants and secret inputs. */
export type SentActionBody = Readonly<Record<string, ActionValue | readonly number[]>>;

const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const forbiddenInSegment = /[/\\?#%]/;

/** The route of the given kind for a step, or `undefined` when the list has none. */
export function routeFor<K extends ActionRoute["kind"]>(
  routes: readonly ActionRoute[],
  ref: ActionStepRef,
  kind: K,
): Extract<ActionRoute, { kind: K }> | undefined {
  const route = routes.find(
    (candidate) =>
      candidate.definition === ref.definition &&
      candidate.version === ref.version &&
      candidate.step === ref.step,
  );
  return route?.kind === kind ? (route as Extract<ActionRoute, { kind: K }>) : undefined;
}

/**
 * Fills a template's placeholders, each with one encoded segment.
 * `undefined` when a value is missing or extra, doesn't match its pattern,
 * is empty, `.` or `..`, or holds `/`, `\`, `?`, `#` or `%`: such a value
 * could change which page or route the call reaches.
 */
export function fillTemplate(
  template: string,
  patterns: Readonly<Record<string, string>>,
  values: Readonly<Record<string, string>>,
): string | undefined {
  const names = [...template.matchAll(placeholder)].map((match) => match[1] ?? "");
  const given = Object.keys(values);
  if (given.length !== names.length || !given.every((name) => names.includes(name))) {
    return undefined;
  }
  const allFit = names.every((name) => isSegment(values[name], patterns[name]));
  if (!allFit) return undefined;
  return template.replace(placeholder, (_whole, name: string) =>
    encodeURIComponent(values[name] ?? ""),
  );
}

function isSegment(value: string | undefined, pattern: string | undefined): boolean {
  if (value === undefined || pattern === undefined) return false;
  if (value === "" || value === "." || value === ".." || forbiddenInSegment.test(value)) {
    return false;
  }
  return matchesWhole(pattern, value);
}

function matchesWhole(pattern: string, value: string): boolean {
  return new RegExp(`^(?:${pattern})$`, "u").test(value);
}

/** Whether the page's body has exactly the route's fields it may send, each of its kind. */
export function isPageBody(route: ActionCallRoute, body: ActionSendRequest["body"]): boolean {
  const pageFields = route.body.filter((field) => !filledBySender(field));
  const given = body ?? {};
  const names = Object.keys(given);
  if (names.length !== pageFields.length) return false;
  return pageFields.every(
    (field) => Object.hasOwn(given, field.name) && fitsField(field, given[field.name]),
  );
}

/** `constant` and `secret-input` fields: the sender fills them, never the page. */
export function filledBySender(field: ActionBodyField): boolean {
  return field.kind === "constant" || field.kind === "secret-input";
}

function fitsField(field: ActionBodyField, value: ActionValue | readonly number[] | undefined) {
  switch (field.kind) {
    case "string":
      return typeof value === "string" && matchesWhole(field.pattern ?? "", value);
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer-list":
      return Array.isArray(value) && value.every((item) => Number.isInteger(item));
    default:
      return false;
  }
}

/**
 * Only the route's kept fields that the answer had as plain values. A dotted
 * name such as `triggering_actor.login` reads one object key per segment, as
 * the shell's `kept_fields` does: a missing key, a list or any other
 * non-object on the way leaves the field out, and so does a literal top-level
 * key that holds the dots.
 */
export function keptFields(
  route: ActionCallRoute,
  fields: Readonly<Record<string, unknown>> = {},
): Record<string, ActionValue> {
  const kept: Record<string, ActionValue> = {};
  for (const name of route.keep) {
    const value = valueAt(fields, name.split("."));
    if (isPlainValue(value)) kept[name] = value;
  }
  return kept;
}

function valueAt(fields: Readonly<Record<string, unknown>>, segments: readonly string[]): unknown {
  let value: unknown = fields;
  for (const segment of segments) {
    if (!isObject(value) || !Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainValue(value: unknown): value is ActionValue {
  if (value === null) return true;
  return ["string", "number", "boolean"].includes(typeof value);
}
