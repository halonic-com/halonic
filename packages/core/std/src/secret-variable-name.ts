/**
 * Words in a variable's name that say its value is a secret, such as
 * `API_KEY`, `NODE_AUTH_TOKEN` or `npm_config__authToken`. Only whole words
 * count, so `KEYMAP` or `AUTHOR` don't.
 */
const secretWords = new Set([
  "APIKEY",
  "AUTH",
  "COOKIE",
  "CREDENTIAL",
  "CREDENTIALS",
  "KEY",
  "PASSPHRASE",
  "PASSWD",
  "PASSWORD",
  "PRIVATE",
  "SECRET",
  "TOKEN",
]);

/**
 * Whether an environment variable's name says its value is a secret: one
 * of its words, in any letter case, is a word such as `TOKEN`, `KEY` or
 * `PASSWORD`. Words are split at each character that is not a letter or
 * digit and before a capital letter that follows a small letter or digit.
 *
 * @example
 * isSecretVariableName("ANTHROPIC_API_KEY"); // true
 * isSecretVariableName("authToken"); // true
 * isSecretVariableName("KEYMAP"); // false
 */
export function isSecretVariableName(name: string): boolean {
  const words = name.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/);
  return words.some((word) => secretWords.has(word.toUpperCase()));
}
