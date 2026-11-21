import { errorKindOf, KindedError } from "@halonicjs/std";

/** The code of the engine's refusal of a workspace that isn't trusted, beside its kind `denied`. */
export const workspaceUntrustedCode = "workspace.untrusted";

/**
 * The engine's refusal to start or send anything because the workspace isn't trusted. It is
 * `denied`, as other refusals are (a folder that isn't open, a 403 from a served computer), so a
 * page that offers **Review** for it tells it apart by its `code`, with {@link isUntrustedRefusal}.
 */
export class WorkspaceUntrusted extends KindedError {
  readonly code = workspaceUntrustedCode;

  /**
   * @param message - the engine's sentence, safe to show and to log
   * @param options - `cause` keeps the refusal this one stands for, for the log
   */
  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super("denied", message, options);
  }
}

/**
 * True for the engine's refusal of a workspace that isn't trusted: a `denied` error with the code
 * {@link workspaceUntrustedCode}, a {@link WorkspaceUntrusted} or the same shape. Any other
 * `denied` is false, so a page shows its own sentence and no **Review**.
 *
 * @example
 * isUntrustedRefusal(new WorkspaceUntrusted("This workspace isn't trusted yet.")); // true
 * isUntrustedRefusal(new KindedError("denied", "The folder isn't open.")); // false
 */
export function isUntrustedRefusal(error: unknown): boolean {
  return (
    errorKindOf(error) === "denied" &&
    (error as { readonly code?: unknown }).code === workspaceUntrustedCode
  );
}
