import type { Schema } from "@halonicjs/schema-kit";

/**
 * `schema` as the port's type `T`. Zod types an optional key as `T | undefined`,
 * which the port's types don't allow; a body parsed from JSON never holds
 * `undefined`, so what the schema lets through is a `T`.
 */
export function portSchema<T>(schema: Schema<unknown>): Schema<T> {
  return schema as Schema<T>;
}
