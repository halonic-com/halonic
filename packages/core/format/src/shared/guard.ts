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

/** The schema of a `Guard`. It refers to itself for `not`, `all` and `any`. */
export const Guard: Schema<Guard> = s.lazy(() =>
  s.union([
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
  ]),
) as Schema<Guard>;
