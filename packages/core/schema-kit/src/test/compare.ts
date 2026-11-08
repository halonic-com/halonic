// Runs one input through plain Zod and through schema-kit's parse, and
// reduces each result to what parity means: pass or fail, the set of
// issue paths, and on success the parsed value. Messages are not compared.
import { expect } from "vitest";
import type { ZodType } from "zod";
import { parse, type Schema } from "../index.ts";

/** One verdict on one input. */
export interface Outcome {
  readonly ok: boolean;
  /** Every distinct issue path, as JSON, sorted. Empty on success. */
  readonly paths: readonly string[];
  /** The parsed value on success. */
  readonly value?: unknown;
}

/** Plain Zod's verdict, as the old app got it. */
export function zodOutcome(schema: ZodType, input: unknown): Outcome {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, paths: [], value: result.data };
  return { ok: false, paths: distinctPaths(result.error.issues.map((issue) => issue.path)) };
}

/** schema-kit's verdict. */
export function kitOutcome(schema: Schema, input: unknown): Outcome {
  const result = parse(schema, input);
  if (result.ok) return { ok: true, paths: [], value: result.value };
  return { ok: false, paths: distinctPaths(result.error.map((issue) => issue.path)) };
}

/** Asserts that schema-kit gives plain Zod's verdict on `input`. */
export function expectSameOutcome(zod: ZodType, kit: Schema, input: unknown): void {
  const expected = zodOutcome(zod, input);
  const actual = kitOutcome(kit, input);
  expect(actual.ok, describeInput(input)).toBe(expected.ok);
  expect(actual.paths, describeInput(input)).toEqual(expected.paths);
  if (expected.ok) expect(actual.value, describeInput(input)).toEqual(expected.value);
}

// String keys and number indexes stay apart: ["0"] and [0] are different paths.
function distinctPaths(paths: readonly (readonly PropertyKey[])[]): string[] {
  const unique = new Set(paths.map((path) => JSON.stringify(path.map(describeSegment))));
  return [...unique].sort();
}

function describeSegment(segment: PropertyKey): string | number {
  return typeof segment === "symbol" ? String(segment) : segment;
}

function describeInput(input: unknown): string {
  try {
    return `input: ${JSON.stringify(input)?.slice(0, 500)}`;
  } catch {
    return "input: (not JSON)";
  }
}
