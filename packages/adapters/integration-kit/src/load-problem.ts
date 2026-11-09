/**
 * Why the loader refused an integration: a code from the sheet's schema or
 * checks, from resolving its hosts, or from the loader itself (such as
 * `kit-version`, `tool-differs` or `sheet-not-approved`). The message names
 * the integration and the field, never a secret value. The same goes for the
 * optional `fix`.
 */
export interface LoadProblem {
  readonly code: string;
  /** Where in the permission sheet the problem sits; `[]` for the sheet as a whole. */
  readonly path: readonly (string | number)[];
  readonly message: string;
  /**
   * The one next step that fixes it, as its own sentence, kept apart from the
   * message so `halonic validate`, `--json` and Studio can show it on its own
   * line. Left out when there is no step to suggest; nothing shows a fix then,
   * and nothing makes one up.
   */
  readonly fix?: string;
}
