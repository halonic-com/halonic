// The failure a run stops on when the profile's secrets file can't be read by
// the person's user account (HAL-15693). The secrets file store names it in
// its cause (`secrets.file-unreadable`, requirement
// `secrets-file.unreadable-cause`); this reads the facts from the cause's
// detail. It names the file, never a secret or a value.

/** Which fix the file needs: `chmod` for the person's own file, `chown` for another user's, `properties` on Windows. */
export type UnreadableSecretsFileFix = "chmod" | "chown" | "properties";

/** A secrets file the person's user account can't read, with the fix its lines give. */
export interface SecretsFileUnreadableFailure {
  readonly reason: "secrets-file-unreadable";
  /** The secrets file, as the run log names it. */
  readonly file: string;
  readonly fix: UnreadableSecretsFileFix;
}

const fixes: ReadonlySet<string> = new Set<UnreadableSecretsFileFix>([
  "chmod",
  "chown",
  "properties",
]);

/**
 * The failure a cause names by its code, or `undefined` for another code, or
 * a cause without the file or with a fix the app doesn't know.
 */
export function secretsFileFailureOf(
  code: string | undefined,
  detail: Readonly<Record<string, string>>,
): SecretsFileUnreadableFailure | undefined {
  if (code !== "secrets.file-unreadable") return undefined;
  const { file, fix } = detail;
  if (file === undefined || fix === undefined || !fixes.has(fix)) return undefined;
  return { reason: "secrets-file-unreadable", file, fix: fix as UnreadableSecretsFileFix };
}
