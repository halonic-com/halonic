import type { ErrorKind } from "@halonicjs/std";
import type { AccessRequest, AccessState, FolderHandle } from "./handles.ts";

/** The access every store call needs. */
export const readWrite: AccessRequest = { mode: "readwrite" };

/**
 * What every store call throws once the page may no longer use the folder:
 * after a reload, or when the person takes the access back in the browser's
 * site settings. `state` is what the browser answered: `prompt` means
 * {@link BrowserFolderDefinitionStore.requestAccess} can ask the person
 * again, from a click; `denied` means only the browser's settings can give
 * it back.
 *
 * Its kind is `denied`, so `errorKindOf` and the surfaces treat it like any
 * other refusal. Check for it with {@link isFolderAccessError}, not
 * `instanceof`: the Studio may load its own copy of this package.
 */
export class FolderAccessError extends Error {
  override readonly name = "FolderAccessError";
  readonly kind: ErrorKind = "denied";
  /** The one next step that gives access back, safe to show. */
  readonly fix: string;
  readonly state: Exclude<AccessState, "granted">;

  /**
   * @param state - what the browser answered
   * @param options - `cause` keeps the browser's own error, for the log
   */
  constructor(state: Exclude<AccessState, "granted">, options: { cause?: unknown } = {}) {
    super("Halonic may no longer use the opened folder.", options);
    this.state = state;
    this.fix =
      state === "prompt"
        ? "Allow access to the folder again."
        : "Allow the folder again in the browser's site settings, or open it again.";
  }
}

/**
 * Whether `value` is a {@link FolderAccessError}: an `Error` named
 * "FolderAccessError" with a `state`. It works across copies of this
 * package, where `instanceof` doesn't.
 */
export function isFolderAccessError(value: unknown): value is FolderAccessError {
  if (!(value instanceof Error) || value.name !== "FolderAccessError") return false;
  const state = (value as { state?: unknown }).state;
  return state === "denied" || state === "prompt";
}

/**
 * Checks the page may still read and write `folder`, without asking the
 * person. A browser without `queryPermission` has no such check, and its
 * calls fail on their own when access is gone.
 *
 * @throws FolderAccessError when access is gone
 */
export async function checkAccess(folder: FolderHandle): Promise<void> {
  const state = (await folder.queryPermission?.(readWrite)) ?? "granted";
  if (state !== "granted") {
    throw new FolderAccessError(state);
  }
}

/**
 * The error a browser call's failure becomes: one that says access was
 * refused (`NotAllowedError`, `SecurityError`) is a {@link FolderAccessError},
 * anything else goes on as it is.
 */
export function accessFailure(error: unknown): unknown {
  if (isDomError(error, "NotAllowedError") || isDomError(error, "SecurityError")) {
    return new FolderAccessError("denied", { cause: error });
  }
  return error;
}

/** Whether `error` is the browser's `DOMException` (or a fake of it) with this name. */
export function isDomError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
