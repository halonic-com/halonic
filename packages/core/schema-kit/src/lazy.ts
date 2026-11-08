import type { IssueCollector, Path } from "./issue.ts";
import type { JsonSchema, JsonSchemaContext } from "./json-schema-context.ts";
import { INVALID, type Parsed, Schema } from "./schema.ts";

/**
 * How deep a value may sit (keys and indexes from the root) before a
 * recursive schema stops. Workspace files are nowhere near it; hostile input
 * would otherwise overflow the call stack.
 */
export const MAX_DEPTH = 256;

/**
 * A schema that refers to itself, such as a guard that contains guards.
 * The getter runs once, on first use. Made by `s.lazy(() => ...)`.
 *
 * @example
 * const Guard: Schema<Guard> = s.lazy(() => s.union([
 *   s.object({ exists: s.string() }).strict(),
 *   s.object({ not: Guard }).strict(),
 * ]));
 */
export class LazySchema<Output, Input = Output> extends Schema<Output, Input> {
  readonly #getSchema: () => Schema<Output, Input>;
  #schema: Schema<Output, Input> | undefined;

  constructor(getSchema: () => Schema<Output, Input>) {
    super();
    this.#getSchema = getSchema;
  }

  /** The schema the getter returns. */
  get schema(): Schema<Output, Input> {
    this.#schema ??= this.#getSchema();
    return this.#schema;
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<Output> {
    if (path.length > MAX_DEPTH) {
      issues.reportFatal("too_deep", path, `Nested more than ${MAX_DEPTH} levels deep`);
      return INVALID;
    }
    return this.schema.check(input, path, issues);
  }

  override toJsonSchemaNode(context: JsonSchemaContext): JsonSchema {
    return context.reference(this, () => this.schema.toJsonSchemaNode(context));
  }
}
