// Checking a service's reply (HAL-18391 plan, section 2.1): when the reply no
// longer fits the integration's schema, say which field changed, never what
// the reply held. The note crosses the bridge as the error's `failureCause`,
// so the integration debugger can name the field without keeping the reply.

import type { ErrorKind } from "@halonicjs/std/error-kind";

/**
 * One problem in a reply, as Zod reports it. Only the parts that come from
 * the schema are read: the path, the code, and the expected type or format.
 * Zod's message is never read, because it may describe the value.
 */
export interface ReplyIssue {
  readonly path: readonly PropertyKey[];
  readonly code?: string;
  readonly expected?: unknown;
  readonly format?: unknown;
}

/** What checking a reply gives: the parsed reply, or what is wrong with it. */
export type ReplyCheck<Output> =
  | { readonly success: true; readonly data: Output }
  | { readonly success: false; readonly error: { readonly issues: readonly ReplyIssue[] } };

/**
 * The part of a Zod schema that {@link checkReply} uses. Every Zod schema has
 * it, so an integration passes its `z.object(...)` as it is. The kit itself
 * doesn't import Zod, so this entry brings in no outside code.
 */
export interface ReplySchema<Output = unknown> {
  safeParse(input: unknown): ReplyCheck<Output>;
}

/** The `detail` of a {@link ReplyChangedError}: `field.1`, `expected.1`, `field.2`, … */
export type ReplyChangedDetail = Readonly<Record<string, string>>;

/** The most `detail` entries a failure note carries across the bridge (`maxFailureDetailEntries`). */
const maxDetailEntries = 8;

/** Each changed field takes two entries: its path and what the schema expected. */
const maxNamedFields = maxDetailEntries / 2;

/** A path or an expected type is repeated only this far. */
const maxNameLength = 64;

/** What stands for a path segment that came from the reply, such as the key of a record. */
const maskedSegment = "{…}";

/**
 * The service's reply no longer fits the integration's schema. The message
 * and `failureCause.detail` name each changed field by its path in the
 * schema and the type it expected, never a value or a key only the reply
 * has. A retry won't help until the integration is fixed, but the service
 * itself may still work, so its kind is `unavailable`.
 *
 * @example
 * catch (error) { if (error instanceof ReplyChangedError) console.log(error.failureCause.detail) } // { "field.1": "fulfillment", "expected.1": "object" }
 */
export class ReplyChangedError extends Error {
  override readonly name = "ReplyChangedError";
  readonly kind: ErrorKind = "unavailable";
  readonly failureCause: { readonly code: "reply-changed"; readonly detail: ReplyChangedDetail };

  constructor(fields: readonly ChangedField[]) {
    super(messageOf(fields));
    this.failureCause = { code: "reply-changed", detail: detailOf(fields) };
  }
}

/** One field that changed: its path in the schema and what the schema expected there. */
export interface ChangedField {
  readonly path: string;
  readonly expected: string;
}

/**
 * Checks a service's reply with the integration's schema and gives the
 * parsed reply. Use `z.object(...)` rather than `z.strictObject(...)` for a
 * reply, so a field the service adds doesn't break the integration.
 *
 * @example
 * const order = checkReply(orderReply, await response.json());
 *
 * @throws {@link ReplyChangedError} naming each changed field and the type
 *   it expected, never the reply's values
 */
export function checkReply<Output>(schema: ReplySchema<Output>, reply: unknown): Output {
  const parsed = schema.safeParse(reply);
  if (parsed.success) return parsed.data;
  throw new ReplyChangedError(changedFields(schema, parsed.error.issues));
}

function changedFields(schema: ReplySchema, issues: readonly ReplyIssue[]): ChangedField[] {
  const fields = new Map<string, ChangedField>();
  for (const issue of issues) {
    // A key only the reply has would name the reply's content, not the schema's.
    if (issue.code === "unrecognized_keys") continue;
    const path = pathOf(schema, issue.path);
    if (!fields.has(path)) fields.set(path, { path, expected: expectedOf(issue) });
  }
  return [...fields.values()];
}

/**
 * `fulfillment.status`, `items.0.price`, or `(reply)` for the reply as a
 * whole. A segment the schema doesn't name, such as a record's key, is
 * masked as `{…}`, because it came from the reply.
 */
function pathOf(schema: ReplySchema, path: readonly PropertyKey[]): string {
  let current: unknown = schema;
  const segments: string[] = [];
  for (const segment of path) {
    const step = stepInto(current, segment);
    segments.push(step.named ? String(segment) : maskedSegment);
    current = step.next;
  }
  return shortened(segments.join(".")) || "(reply)";
}

/**
 * Follows one path segment into a Zod schema, through its public parts only:
 * an object's `shape`, an array's `element`, a record's `valueType`, and the
 * `unwrap()` of optional, nullable and similar wrappers. A numeric index
 * holds no content, so it is kept; any other segment is kept only when the
 * schema names it.
 */
function stepInto(schema: unknown, segment: PropertyKey): { named: boolean; next: unknown } {
  const bare = unwrapped(schema);
  if (typeof segment === "number") return { named: true, next: partOf(bare, "element") };
  const shape = partOf(bare, "shape");
  if (typeof segment === "string" && isObject(shape) && Object.hasOwn(shape, segment)) {
    return { named: true, next: shape[segment] };
  }
  return { named: false, next: partOf(bare, "valueType") };
}

/** Zod's wrappers whose `unwrap()` gives the schema inside. */
const wrapperTypes = new Set(["optional", "nullable", "default", "readonly", "catch", "lazy"]);

function unwrapped(schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < 16 && isWrapper(current); depth++) current = current.unwrap();
  return current;
}

function isWrapper(schema: unknown): schema is { unwrap(): unknown } {
  return (
    isObject(schema) &&
    typeof schema["type"] === "string" &&
    wrapperTypes.has(schema["type"]) &&
    typeof schema["unwrap"] === "function"
  );
}

function partOf(schema: unknown, key: string): unknown {
  return isObject(schema) ? schema[key] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * What the schema expected: the type for a wrong or missing field, the
 * format for a malformed one, else the kind of rule that failed (such as
 * `too_small`). Each comes from the schema, never from the value.
 */
function expectedOf(issue: ReplyIssue): string {
  if (issue.code === "invalid_type" && typeof issue.expected === "string") {
    return shortened(issue.expected);
  }
  if (issue.code === "invalid_format" && typeof issue.format === "string") {
    return shortened(issue.format);
  }
  return shortened(issue.code ?? "valid value");
}

function detailOf(fields: readonly ChangedField[]): ReplyChangedDetail {
  const detail: Record<string, string> = {};
  fields.slice(0, maxNamedFields).forEach((field, index) => {
    detail[`field.${index + 1}`] = field.path;
    detail[`expected.${index + 1}`] = field.expected;
  });
  return detail;
}

function messageOf(fields: readonly ChangedField[]): string {
  if (fields.length === 0) return "The service's reply changed.";
  const named = fields.slice(0, maxNamedFields).map((field) => `${field.path} (${field.expected})`);
  const more = fields.length - named.length;
  const rest = more > 0 ? `, and ${more} more` : "";
  return `The service's reply changed: check ${named.join(", ")}${rest}.`;
}

function shortened(name: string): string {
  return name.slice(0, maxNameLength);
}
