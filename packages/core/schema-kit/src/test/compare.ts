// Runs one input through Zod and schema-kit and reduces each result to what
// parity means (D7): pass or fail, the set of issue paths, and on success
// the parsed value. Messages are ours and are not compared.
import { expect } from "vitest";
import type { ZodType } from "zod";
import type { Schema } from "../index.ts";

/** One library's verdict on one input. */
export interface Outcome {
  readonly ok: boolean;
  /** Every distinct issue path, as JSON, sorted. Empty on success. */
  readonly paths: readonly string[];
  /** The parsed value on success. */
  readonly value?: unknown;
}

/** Zod's verdict. */
export function zodOutcome(schema: ZodType, input: unknown): Outcome {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, paths: [], value: result.data };
  return { ok: false, paths: distinctPaths(result.error.issues.map((issue) => issue.path)) };
}

/** Anything with schema-kit's `safeParse`. */
export type KitSchema = Pick<Schema<unknown>, "safeParse">;

/** schema-kit's verdict. */
export function kitOutcome(schema: KitSchema, input: unknown): Outcome {
  const result = schema.safeParse(input);
  if (result.ok) return { ok: true, paths: [], value: result.value };
  return { ok: false, paths: distinctPaths(result.error.map((issue) => issue.path)) };
}

/** Asserts that both libraries agree on `input`. */
export function expectSameOutcome(zod: ZodType, kit: KitSchema, input: unknown): void {
  const expected = zodOutcome(zod, input);
  const actual = kitOutcome(kit, input);
  expect(actual.ok, describeInput(input)).toBe(expected.ok);
  expect(actual.paths, describeInput(input)).toEqual(expected.paths);
  if (expected.ok) expect(actual.value, describeInput(input)).toEqual(expected.value);
}

function distinctPaths(paths: readonly (readonly PropertyKey[])[]): string[] {
  const unique = new Set(paths.map((path) => JSON.stringify(path.map(String))));
  return [...unique].sort();
}

function describeInput(input: unknown): string {
  try {
    return `input: ${JSON.stringify(input)?.slice(0, 500)}`;
  } catch {
    return "input: (not JSON)";
  }
}
