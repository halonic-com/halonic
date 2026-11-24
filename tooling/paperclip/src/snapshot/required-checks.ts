/**
 * The checks the merge queue requires that a green `ci-ok` doesn't cover
 * (HAL-17760). `Guard notes` is the organisation's required workflow:
 * GitHub runs it only on some events, so a head can have a green `ci-ok`
 * and no run of it at all. Keyed by the check run's name, the job's, with
 * the workflow's name people know it by.
 */
export const requiredChecks: ReadonlyMap<string, string> = new Map([
  ["Decision note and the guard's own paths", "Guard notes"],
]);

/** A head's check rollup, as far as this needs it: the names of its first 100 checks. */
export interface NamedRollup {
  readonly contexts: {
    readonly pageInfo: { readonly hasNextPage: boolean };
    readonly nodes: readonly { readonly name?: string }[];
  };
}

/**
 * The required checks with no run on the head, by the names people know
 * them by, sorted. None when the rollup was cut off, since a later page may
 * hold them.
 */
export function missingRequired(rollup: NamedRollup | null): string[] {
  if (rollup?.contexts.pageInfo.hasNextPage === true) {
    return [];
  }
  const names = new Set((rollup?.contexts.nodes ?? []).map((node) => node.name));
  return [...requiredChecks]
    .filter(([name]) => !names.has(name))
    .map(([, shown]) => shown)
    .sort();
}
