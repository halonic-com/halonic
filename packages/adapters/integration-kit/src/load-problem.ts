/**
 * Why the loader refused an integration: a code from the sheet's schema or
 * checks, from resolving its hosts, or from the loader itself (such as
 * `kit-version`, `tool-differs` or `sheet-not-approved`). The message names
 * the integration and the field, never a secret value.
 */
export interface LoadProblem {
  readonly code: string;
  /** Where in the permission sheet the problem sits; `[]` for the sheet as a whole. */
  readonly path: readonly (string | number)[];
  readonly message: string;
}
