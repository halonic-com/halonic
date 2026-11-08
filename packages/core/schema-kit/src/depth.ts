import type { Issue, PathSegment } from "./issue.ts";

/**
 * How many keys and indexes deep an input may go. Workspace files are
 * nowhere near it. Deeper input, or a value that contains itself, would
 * otherwise overflow the call stack inside Zod.
 */
export const MAX_DEPTH = 256;

interface Pending {
  readonly value: unknown;
  readonly path: readonly PathSegment[];
}

/**
 * Finds the first value nested deeper than `MAX_DEPTH`, without recursion,
 * and describes it as a `too_deep` issue at its path.
 */
export function findTooDeep(input: unknown): Issue | undefined {
  const pending: Pending[] = [{ value: input, path: [] }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next.path.length > MAX_DEPTH) {
      return {
        code: "too_deep",
        path: next.path,
        message: `Nested more than ${MAX_DEPTH} levels deep`,
      };
    }
    for (const [key, child] of childrenOf(next.value)) {
      pending.push({ value: child, path: [...next.path, key] });
    }
  }
  return undefined;
}

function childrenOf(value: unknown): [PathSegment, unknown][] {
  // Array.from, unlike map, also visits the holes of a sparse list.
  if (Array.isArray(value)) return Array.from(value, (item, index) => [index, item]);
  if (typeof value === "object" && value !== null) return Object.entries(value);
  return [];
}
