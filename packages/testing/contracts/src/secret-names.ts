/**
 * Names every `Secrets` and `TokenStore` method must refuse with a
 * `RangeError`: not `^[A-Za-z][A-Za-z0-9_-]*$`, or longer than 128 characters.
 */
export const invalidSecretNames: readonly string[] = [
  "",
  "1password",
  "_token",
  "-token",
  "serve password",
  "serve.password",
  "../serve-password",
  "serve/password",
  "sérve",
  "token\n",
  `a${"b".repeat(128)}`,
];

/** The longest valid name: 128 characters. */
export const longestSecretName = `a${"b".repeat(127)}`;
