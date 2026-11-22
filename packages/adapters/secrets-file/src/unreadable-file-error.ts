import { KindedError, shellWord } from "@halonicjs/std";

/** The cause code of {@link UnreadableSecretsFileError}, as a run log records it. */
export const unreadableSecretsFileCode = "secrets.file-unreadable";

/**
 * Which fix the person needs, as data a run log can keep: `chmod` for a file
 * they own, `chown` for one another user owns, `properties` on Windows.
 */
export type UnreadableFileFix = "chmod" | "chown" | "properties";

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
export function unreadableSecretsFileError(
  found: UnreadableFile,
  cause: unknown,
): UnreadableSecretsFileError {
  return new UnreadableSecretsFileError(found.file, fixKindOf(found), cause);
}

/**
 * A secrets file the person running Halonic may not read, refused as
 * `denied` with its fix (see {@link unreadableSecretsFileError}).
 *
 * When it stops a run, the engine logs its `failureCause` on `run.failed`,
 * so `halonic run` and Studio say the cause and the fix instead of asking
 * for a bug report (HAL-15693), as they do for a file other users can read
 * (HAL-12569).
 *
 * @example
 * new UnreadableSecretsFileError("/profile/secrets/secrets.json", "chmod", undefined).failureCause;
 * // { code: "secrets.file-unreadable", detail: { file: "/profile/secrets/secrets.json", fix: "chmod" } }
 */
export class UnreadableSecretsFileError extends KindedError {
  /** The cause the engine logs on `run.failed`: the code, the file and which fix it needs. */
  readonly failureCause: {
    readonly code: typeof unreadableSecretsFileCode;
    readonly detail: { readonly file: string; readonly fix: UnreadableFileFix };
  };

  constructor(file: string, fix: UnreadableFileFix, cause: unknown) {
    super("denied", `The secrets file ${file} can't be read by your user account.`, {
      fix: fixWords(file, fix),
      cause,
    });
    this.failureCause = { code: unreadableSecretsFileCode, detail: { file, fix } };
  }
}

function fixKindOf({ ownerId, userId }: UnreadableFile): UnreadableFileFix {
  if (userId === undefined) return "properties";
  return ownerId === userId ? "chmod" : "chown";
}

function fixWords(file: string, fix: UnreadableFileFix): string {
  const word = shellWord(file);
  switch (fix) {
    case "properties":
      return "Give your user account access to it in the file's Properties, under Security, then run again.";
    case "chown":
      return `It belongs to another user: run sudo chown "$(id -un)" ${word}, then chmod 600 ${word}, then run again.`;
    case "chmod":
      return `Run chmod 600 ${word}, then run again.`;
  }
}
