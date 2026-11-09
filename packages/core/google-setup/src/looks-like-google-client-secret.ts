/**
 * `GOCSPX-` at the start of a word, followed by at least one character a
 * secret can hold. Unlike the leak check, which wants 20 or more so it doesn't
 * flag code that talks about the prefix, this also catches a secret that was
 * cut short while pasting.
 */
const clientSecretPattern = /\bGOCSPX-[A-Za-z0-9_-]/;

/**
 * Whether the text holds something shaped like a Google OAuth client secret,
 * so Studio can clear a client ID field (C3) before the secret is kept there.
 *
 * Notes and chat messages (C6) don't use this: they hold a message with
 * `findSecretShape` from `@halonicjs/std`, the check the Assistant and Try it
 * share, so all three spot the same formats.
 *
 * @example
 * looksLikeGoogleClientSecret("here it is: GOCSPX-abc123"); // true
 * looksLikeGoogleClientSecret("1234-abc.apps.googleusercontent.com"); // false
 */
export function looksLikeGoogleClientSecret(text: string): boolean {
  return clientSecretPattern.test(text);
}
