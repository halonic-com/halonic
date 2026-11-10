import type { Usage } from "./run-basics.ts";

/** The optional token counts of a call that used a prompt cache. */
const cacheCounts = ["cacheReadTokens", "cacheWriteTokens", "cacheWrite1hTokens"] as const;

/**
 * The tokens of two model calls together. A cache count is in the sum only
 * when one of them has it, so calls without a prompt cache keep their old shape.
 *
 * @example
 * addUsage({ inputTokens: 10, outputTokens: 5 }, { inputTokens: 2, outputTokens: 1, cacheReadTokens: 900 });
 * // { inputTokens: 12, outputTokens: 6, cacheReadTokens: 900 }
 */
export function addUsage(total: Usage, more: Usage): Usage {
  const sum: Usage = {
    inputTokens: total.inputTokens + more.inputTokens,
    outputTokens: total.outputTokens + more.outputTokens,
  };
  for (const count of cacheCounts) {
    const added = addOptional(total[count], more[count]);
    if (added !== undefined) sum[count] = added;
  }
  return sum;
}

function addOptional(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) return undefined;
  return (left ?? 0) + (right ?? 0);
}
