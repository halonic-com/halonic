import { KindedError } from "@halonicjs/std";

/** The cause code of {@link ReadableSecretsFileError}, as a run log records it. */
export const readableSecretsFileCode = "secrets.file-readable";

/**
 * A secrets file that group or others can read, refused as `denied` with the
 * fix, `chmod 600 <file>`. It names neither a secret nor a value.
 *
 * When it stops a run, the engine logs its `failureCause` on `run.failed`,
 * so `halonic run` says the cause and the fix instead of asking for a bug
 * report (HAL-12569), as `halonic secret list` does for the same file.
 *
 * @example
 * new ReadableSecretsFileError("/profile/secrets/secrets.json").failureCause;
 * // { code: "secrets.file-readable", detail: { file: "/profile/secrets/secrets.json" } }
 */
export class ReadableSecretsFileError extends KindedError {
  /** The cause the engine logs on `run.failed`: the code and the file it is about. */
  readonly failureCause: {
    readonly code: typeof readableSecretsFileCode;
    readonly detail: { readonly file: string };
  };

  constructor(file: string) {
    super("denied", `The secrets file ${file} can be read by other users.`, {
      fix: `Run chmod 600 ${file}, then run again.`,
    });
    this.failureCause = { code: readableSecretsFileCode, detail: { file } };
  }
}
