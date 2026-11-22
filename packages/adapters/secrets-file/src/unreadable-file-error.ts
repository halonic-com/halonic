import { KindedError, shellWord } from "@halonicjs/std";

/** What {@link unreadableSecretsFileError} needs to know about the file and who runs Halonic. */
export interface UnreadableFile {
  /** The secrets file, as the store resolved it. */
  readonly file: string;
  /** The file's owner, as `lstat` reports it. */
  readonly ownerId: number;
  /** The user Halonic runs as (`process.getuid()`), or `undefined` on Windows, which has none. */
  readonly userId: number | undefined;
}

/**
 * Whether a file system error says the file is there but this user may not
 * open it: `EACCES`, or `EPERM`, which Windows and some file systems give
 * for the same thing.
 */
export function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "EACCES" || code === "EPERM";
}

/**
 * The refusal for a secrets file the person running Halonic may not read,
 * such as one left with mode `000` or created by another user with `sudo`.
 * Instead of the file system's own error, which the command line can only
 * report as a bug, it names the file and the fix (HAL-15511):
 *
 * - the person owns the file: `chmod 600 <file>`;
 * - another user owns it: `sudo chown`, back to the person, then `chmod 600`;
 * - Windows: give the person's account access in the file's properties.
 *
 * The file is written for a shell (`std.shell-word`) in the commands, so the
 * fix can be pasted as it is. It names neither a secret nor a value.
 *
 * @param cause - the file system's error, kept for `--debug`
 */
export function unreadableSecretsFileError(found: UnreadableFile, cause: unknown): KindedError {
  return new KindedError(
    "denied",
    `The secrets file ${found.file} can't be read by your user account.`,
    {
      fix: fixFor(found),
      cause,
    },
  );
}

function fixFor({ file, ownerId, userId }: UnreadableFile): string {
  if (userId === undefined) {
    return "Give your user account access to it in the file's Properties, under Security, then run again.";
  }
  const word = shellWord(file);
  if (ownerId !== userId) {
    return `It belongs to another user: run sudo chown "$(id -un)" ${word}, then chmod 600 ${word}, then run again.`;
  }
  return `Run chmod 600 ${word}, then run again.`;
}
