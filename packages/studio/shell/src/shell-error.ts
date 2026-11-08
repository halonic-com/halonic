/**
 * Thrown when features don't fit together: a duplicate id, a service nobody
 * provides or two features provide, a cycle, or a contribution that points at
 * something missing. The message names the features involved and how to fix it.
 */
export class ShellError extends Error {
  override name = "ShellError";
}
