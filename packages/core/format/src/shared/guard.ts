import { type Schema, s } from "@halonicjs/schema-kit";

/**
 * A condition on a run's data, used by workflow transitions and signal
 * routines. Values may be `{{path}}` templates.
 */
export type Guard =
  | { equals: [unknown, unknown] }
  | { notEquals: [unknown, unknown] }
  | { contains: [unknown, unknown] }
  | { exists: string }
  /** Numbers: both sides are read as numbers; a side that is no number makes the guard false. */
  | { gt: [unknown, unknown] }
  | { gte: [unknown, unknown] }
  | { lt: [unknown, unknown] }
  | { lte: [unknown, unknown] }
  | { not: Guard }
  | { all: Guard[] }
  | { any: Guard[] };

const pair = () => s.tuple([s.unknown(), s.unknown()]);

/** The condition kinds, in the order the schema tries them. */
const GUARD_KINDS = [
  "equals",
  "notEquals",
  "contains",
  "exists",
  "gt",
  "gte",
  "lt",
  "lte",
  "not",
  "all",
  "any",
] as const;

/** What each kind takes, for the message about a known kind written the wrong way. */
const GUARD_SHAPES: Readonly<Record<(typeof GUARD_KINDS)[number], string>> = {
  equals: "a list of two values",
  notEquals: "a list of two values",
  contains: "a list of two values",
  exists: "a path, such as input.email",
  gt: "a list of two values",
  gte: "a list of two values",
  lt: "a list of two values",
  lte: "a list of two values",
  not: "one condition",
  all: "a list of conditions",
  any: "a list of conditions",
};

/**
 * Says what is wrong with a value that is no condition, instead of Zod's
 * "Invalid input": an unknown kind and the allowed ones, or what a known
 * kind takes.
 */
export function guardProblem(input: unknown): string {
  const allowed = `allowed: ${GUARD_KINDS.join(", ")}`;
  const keys =
    typeof input === "object" && input !== null && !Array.isArray(input) ? Object.keys(input) : [];
  if (keys.length !== 1) {
    return `a condition is a map with exactly one kind, such as { equals: [a, b] }; ${allowed}`;
  }
  const [kind = ""] = keys;
  const shape = (GUARD_SHAPES as Readonly<Record<string, string>>)[kind];
  return shape === undefined
    ? `unknown condition kind "${kind}"; ${allowed}`
    : `condition "${kind}" takes ${shape}`;
}

/** The schema of a `Guard`. It refers to itself for `not`, `all` and `any`. */
export const Guard: Schema<Guard> = s.lazy(() =>
  s.union(
    [
      s.object({ equals: pair() }).strict(),
      s.object({ notEquals: pair() }).strict(),
      s.object({ contains: pair() }).strict(),
      s.object({ exists: s.string() }).strict(),
      s.object({ gt: pair() }).strict(),
      s.object({ gte: pair() }).strict(),
      s.object({ lt: pair() }).strict(),
      s.object({ lte: pair() }).strict(),
      s.object({ not: Guard }).strict(),
      s.object({ all: s.array(Guard) }).strict(),
      s.object({ any: s.array(Guard) }).strict(),
    ],
    { error: (issue) => guardProblem(issue.input) },
  ),
) as Schema<Guard>;

/** Whether a value is a condition the engine accepts, so callers can check before they write one. */
export function isGuard(value: unknown): value is Guard {
  return Guard.safeParse(value).success;
}
