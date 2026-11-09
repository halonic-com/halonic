/**
 * Why a save failed, as the user can act on it: free some space, pick a
 * folder they may write to, close the program that holds the file, or copy
 * the details of anything else.
 */
export type SaveReason = "disk-full" | "not-writable" | "in-use" | "failed";

/** A failed save: its reason, and the original error kept for Copy details. */
export interface SaveFailure {
  readonly reason: SaveReason;
  /** The error's code, such as `ENOSPC`, when it had one. */
  readonly code?: string;
  /** The original message. It goes into the copied details, never on screen. */
  readonly detail: string;
}

/**
 * Write error codes by reason. `EBUSY` is what Node reports for a Windows
 * sharing violation; the Windows names cover errors that reach the shell
 * from the desktop side without that translation.
 */
const reasonByCode: Readonly<Record<string, Exclude<SaveReason, "failed">>> = {
  ENOSPC: "disk-full",
  EDQUOT: "disk-full",
  EACCES: "not-writable",
  EPERM: "not-writable",
  EROFS: "not-writable",
  EBUSY: "in-use",
  ERROR_SHARING_VIOLATION: "in-use",
  ERROR_LOCK_VIOLATION: "in-use",
};

/**
 * Maps a write error to a save reason. This is the one place the shell does
 * that, so no screen shows an `errno` code. An error it doesn't know, or
 * something thrown that isn't an error, is `failed` with its details kept.
 *
 * @example
 * saveFailureFor(Object.assign(new Error("no space left on device"), { code: "ENOSPC" }));
 * // { reason: "disk-full", code: "ENOSPC", detail: "no space left on device" }
 */
export function saveFailureFor(error: unknown): SaveFailure {
  const code = codeOf(error);
  const detail = detailOf(error);
  if (code === undefined) {
    return { reason: "failed", detail };
  }
  const reason = Object.hasOwn(reasonByCode, code) ? reasonByCode[code] : undefined;
  return { reason: reason ?? "failed", code, detail };
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "string" && code !== "" ? code : undefined;
}

function detailOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
