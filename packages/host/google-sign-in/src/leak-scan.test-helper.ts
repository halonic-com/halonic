/** What a test hands to the leak scan: everything a caller or a log could see. */
export interface LeakScanInput {
  /** Every value returned. Scanned as is and as `JSON.stringify` gives it. */
  readonly results?: readonly unknown[];
  /** Every error thrown. Scanned for message, `cause`, stack and `toString`. */
  readonly errors?: readonly unknown[];
  /** Every request URL and every stored name. Request bodies are left out: the exchange must send the secret there. */
  readonly texts?: readonly string[];
}

/** The texts of an error a log line could show, `cause` included. */
function errorTexts(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [String(error)];
  }
  return [error.message, String(error), error.stack ?? "", ...errorTexts(error.cause ?? "")];
}

/**
 * The secrets that show up anywhere in `input`. A named helper, so the routes
 * (B5) can reuse it for the request-log test (plan D6).
 *
 * @param secrets - the fake secrets by name, such as `{ clientSecret: "fake-…" }`
 * @param input - the results, errors and texts to scan
 * @returns the names of the secrets found, empty when nothing leaked
 */
export function findLeakedSecrets(
  secrets: Readonly<Record<string, string>>,
  input: LeakScanInput,
): string[] {
  const haystack = [
    ...(input.results ?? []).flatMap((result) => [String(result), JSON.stringify(result) ?? ""]),
    ...(input.errors ?? []).flatMap(errorTexts),
    ...(input.texts ?? []),
  ];
  return Object.entries(secrets)
    .filter(([, secret]) => haystack.some((text) => text.includes(secret)))
    .map(([name]) => name);
}
