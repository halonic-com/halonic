/**
 * The two ways a patch is refused. The Studio tells them apart: a stale patch
 * can be refreshed, a patch the Vcs will never apply can't.
 */

/** Thrown when a hunk's old lines aren't in the file, or a file to create already exists. */
export class PatchMismatchError extends Error {
  constructor() {
    super("The change no longer matches the file.");
    this.name = "PatchMismatchError";
  }
}

/**
 * Thrown for a patch that would be refused whatever the files hold: one this
 * reader can't read, or one that does more than edit, add or delete a text
 * file's lines. A `RangeError`, like every input the `Vcs` port refuses.
 */
export class PatchFormatError extends RangeError {
  constructor(reason: string) {
    super(`The patch can't be applied: ${reason}.`);
    this.name = "PatchFormatError";
  }
}
